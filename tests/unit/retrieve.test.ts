import { describe, expect, it } from "vitest";
import fixtures from "../../evals/fixtures/places.json";
import { CatalogSchema, PoiSchema, type Poi } from "@/lib/contracts/poi";
import type { Intent, RecommendRequest } from "@/lib/contracts/request";
import { rankCandidates, type RankingContext } from "@/lib/search/rank";
import { retrieve } from "@/lib/search/retrieve";

const origin = { lat: 51.09, lon: 71.42 };
const now = new Date("2026-10-20T07:00:00Z");
const sourceIds = ["source:fixture:quiet-cafe"];

function poi(overrides: Partial<Poi> = {}): Poi {
  return PoiSchema.parse({ ...structuredClone(fixtures.places[0]), id: "fixture:near", location: { ...origin }, hours: null, ...overrides });
}

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    categories: [], radiusM: 2000, durationMinutes: 60, company: "solo", maxSpendKzt: null, openNow: false,
    requiredFacts: [], preferredTags: [], conflict: null, ...overrides,
  };
}

function request(overrides: Partial<RecommendRequest> = {}): RecommendRequest {
  return {
    query: "Кафе", locale: "ru", location: { ...origin, source: "preset" },
    filters: { categories: [], radiusM: 2000, durationMinutes: 60, company: "solo", maxSpendKzt: null, openNow: false },
    explicitFilterKeys: [], profileId: null, savedIds: [], dismissedIds: [], ...overrides,
  };
}

function context(overrides: Partial<RankingContext> = {}): RankingContext {
  return {
    query: "", origin, intent: intent(), now, profileId: null, savedIds: [], dismissedIds: [], queryVector: null, index: null, ...overrides,
  };
}

describe("normalized hybrid ranking and bounded visit estimates", () => {
  it.each([NaN, Infinity, -0.1, 1.1])("rejects a non-normalized injected semantic score %s", (score) => {
    expect(() => rankCandidates([poi()], context({ semanticScores: { "fixture:near": score } }))).toThrow();
  });

  it("uses the agreed semantic/lexical/distance weights with no demo profile", () => {
    const place = poi({ name: "Кофе", tags: [], description: { text: "", sourceIds } });
    const ranked = rankCandidates([place], context({ query: "КОФЕ", semanticScores: { [place.id]: 0.8 } }));
    expect(ranked[0].score).toBeCloseTo(0.79, 6); // .55*.8 + .20*1 + .15*1 + .10*0.
  });

  it("lets stronger semantic evidence outrank lexical-only overlap", () => {
    const lexical = poi({ id: "fixture:lexical", name: "Кофе", tags: [], description: { text: "", sourceIds } });
    const semantic = poi({ id: "fixture:semantic", name: "Место", tags: [], description: { text: "", sourceIds } });
    const ranked = rankCandidates([lexical, semantic], context({ query: "кофе", semanticScores: { [lexical.id]: 0, [semantic.id]: 1 } }));
    expect(ranked[0].poi.id).toBe("fixture:semantic");
  });

  it.each([
    ["ТЫНЫШ ӘҒҚҢӨҰҮҺІ", "Тыныш әғқңөұүһі"],
    ["РОЗЕТКА, ТИШИНА!", "Розетка тишина"],
    ["elem", "Élém"],
  ])("preserves useful Unicode word matching for %s", (query, name) => {
    const match = poi({ id: "fixture:match", name, tags: [], description: { text: "", sourceIds } });
    const distractor = poi({ id: "fixture:distractor", name: "Совсем другое место", tags: [], description: { text: "", sourceIds } });
    expect(rankCandidates([distractor, match], context({ query }))[0].poi.id).toBe("fixture:match");
  });

  it("does not let unknown saved/dismissed IDs affect eligible catalogue scores", () => {
    const baseline = rankCandidates([poi()], context());
    const unknown = rankCandidates([poi()], context({ savedIds: ["missing:saved"], dismissedIds: ["missing:dismissed"] }));
    expect(unknown).toEqual(baseline);
  });

  it("excludes a dismissed catalogue ID rather than merely lowering its score", () => {
    expect(rankCandidates([poi()], context({ dismissedIds: ["fixture:near"] }))).toEqual([]);
  });

  it("breaks equal scores deterministically by stable POI ID without mutating the input", () => {
    const input = [poi({ id: "fixture:b" }), poi({ id: "fixture:a" })];
    expect(rankCandidates(input, context()).map((item) => item.poi.id)).toEqual(["fixture:a", "fixture:b"]);
    expect(input.map((item) => item.id)).toEqual(["fixture:b", "fixture:a"]);
  });

  it.each([
    ["cafe", 20, 40], ["restaurant", 30, 60], ["park", 20, 60], ["museum", 40, 90],
    ["bowling", 45, 90], ["entertainment", 30, 60], ["other", 20, 45],
  ] as const)("estimates %s visit bounds from code", (category, min, max) => {
    const ranked = rankCandidates([poi({ category })], context({ intent: intent({ durationMinutes: 120 }) }));
    expect(ranked[0].visitMinutes).toEqual({ min, max, isEstimate: true });
  });

  it("caps estimated maximum by both the requested duration and known closing time", () => {
    const place = poi({ hours: { timezone: "Asia/Almaty", sourceIds, weekly: [{ weekday: 2, opens: "09:00", closes: "12:25", overnight: false }] } });
    const ranked = rankCandidates([place], context({ intent: intent({ durationMinutes: 30 }) }));
    expect(ranked[0].visitMinutes).toEqual({ min: 20, max: 25, isEstimate: true });
  });

  it("keeps the full requested visit for a continuously open 24/7 venue at midnight", () => {
    const place = poi({ category: "museum", hours: { timezone: "Asia/Almaty", sourceIds, weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: "00:00", closes: "00:00", overnight: true })) } });
    const ranked = rankCandidates([place], context({ now: new Date("2026-10-18T18:50:00Z"), intent: intent({ durationMinutes: 120 }) }));
    expect(ranked[0].visitMinutes).toEqual({ min: 40, max: 90, isEstimate: true });
  });
});

describe("retrieval applies hard filters before any profile or scoring", () => {
  it("returns no matches instead of arbitrary first places for an impossible budget", async () => {
    const result = await retrieve(request(), intent({ categories: ["cafe"], maxSpendKzt: 100 }), now, { catalog: CatalogSchema.parse(fixtures) });
    expect(result).toEqual([]);
  });

  it("honors extracted constraints over request defaults and a coffee-oriented student profile", async () => {
    const result = await retrieve(request({ query: "Боулинг", profileId: "student" }), intent({ categories: ["bowling"] }), now, { catalog: CatalogSchema.parse(fixtures) });
    // The fixture bowling opens at12:00 Almaty on this Tuesday.
    expect(result.map((item) => item.poi.id)).toEqual(["fixture:bowling"]);
  });

  it("never reintroduces a far/unknown/over-budget POI through high semantic scores", async () => {
    const unknown = poi({ id: "fixture:unknown-price", price: null });
    const far = poi({ id: "fixture:far", location: { lat: 51.2, lon: 71.5 } });
    const catalog = CatalogSchema.parse({ schemaVersion: "1.0", synthetic: true, places: [unknown, far, poi()] });
    const result = await retrieve(request(), intent({ categories: ["cafe"], radiusM: 1000, maxSpendKzt: 2500 }), now, {
      catalog, semanticScores: { [unknown.id]: 1, [far.id]: 1, "fixture:near": 0 },
    });
    expect(result.map((item) => item.poi.id)).toEqual(["fixture:near"]);
  });

  it("returns at most8 catalogue candidates without duplicating IDs", async () => {
    const places = Array.from({ length: 12 }, (_, index) => poi({ id: `fixture:place-${index}` }));
    const catalog = CatalogSchema.parse({ schemaVersion: "1.0", synthetic: true, places });
    const result = await retrieve(request(), intent(), now, { catalog });
    expect(result).toHaveLength(8);
    expect(new Set(result.map((item) => item.poi.id)).size).toBe(8);
    expect(result.every((item) => places.some((place) => place.id === item.poi.id))).toBe(true);
  });

  it("preserves Kazakh query matching through the retrieval boundary", async () => {
    const match = poi({ id: "fixture:kazakh", name: "Тыныш әсем жер", tags: [], description: { text: "", sourceIds } });
    const other = poi({ id: "fixture:other", name: "Басқа орын", tags: [], description: { text: "", sourceIds } });
    const catalog = CatalogSchema.parse({ schemaVersion: "1.0", synthetic: true, places: [other, match] });
    const result = await retrieve(request({ query: "ТЫНЫШ ӘСЕМ ЖЕР", locale: "kk" }), intent(), now, { catalog });
    expect(result[0].poi.id).toBe("fixture:kazakh");
  });

  it("does not mutate the catalogue or extracted filters while searching", async () => {
    const catalog = CatalogSchema.parse(fixtures);
    const constraints = intent({ categories: ["cafe"] });
    const before = JSON.stringify({ catalog, constraints });
    await retrieve(request(), constraints, now, { catalog });
    expect(JSON.stringify({ catalog, constraints })).toBe(before);
  });
});
