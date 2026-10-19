import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "../../evals/fixtures/places.json";
import { CatalogSchema, PoiSchema, type Poi } from "@/lib/contracts/poi";
import { createDefaultFilters, type Intent, type ProfileId, type RecommendRequest } from "@/lib/contracts/request";
import { retrieve } from "@/lib/search/retrieve";
import { recommend } from "@/lib/recommend";

const origin = { lat: 51.09, lon: 71.42 };
const now = new Date("2026-10-20T10:00:00Z");
const sourceIds = ["source:fixture:quiet-cafe"];
function place(id: string, category: Poi["category"], overrides: Partial<Poi> = {}): Poi {
  return PoiSchema.parse({
    ...structuredClone(fixtures.places[0]), id, category, name: "Место", location: origin,
    description: { text: "", sourceIds }, tags: [], facts: [], hours: null, price: null, ...overrides,
  });
}
const cafe = place("fixture:z-cafe", "cafe");
const bowling = place("fixture:a-bowling", "bowling");
const catalog = CatalogSchema.parse({ schemaVersion: "1.0", synthetic: true, places: [cafe, bowling] });
function request(profileId: ProfileId | null, overrides: Partial<RecommendRequest> = {}): RecommendRequest {
  return { query: "Перерыв", locale: "ru", location: { ...origin, source: "preset" }, filters: createDefaultFilters(), explicitFilterKeys: [], profileId, savedIds: [], dismissedIds: [], ...overrides };
}
function intent(overrides: Partial<Intent> = {}): Intent {
  return { ...createDefaultFilters(), requiredFacts: [], preferredTags: [], conflict: null, ...overrides };
}
beforeEach(() => {
  vi.stubEnv("APP_AI_MODE", "stub"); vi.stubEnv("OPENROUTER_PAID_ENABLED", "false"); vi.stubEnv("LIVE_EVAL_ENABLED", "false");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("demo profile influence stays behind the current hard request", () => {
  it("a coffee-oriented student profile really changes an eligible tie, then explicit bowling still wins", async () => {
    const noProfile = await retrieve(request(null), intent(), now, { catalog, index: null });
    const student = await retrieve(request("student"), intent(), now, { catalog, index: null });
    expect(noProfile.map(({ poi }) => poi.id)).toEqual(["fixture:a-bowling", "fixture:z-cafe"]);
    expect(student.map(({ poi }) => poi.id)).toEqual(["fixture:z-cafe", "fixture:a-bowling"]);
    const explicit = await retrieve(request("student", { query: "", filters: { ...createDefaultFilters(), categories: ["bowling"] }, explicitFilterKeys: ["categories"], savedIds: [cafe.id] }), intent({ categories: ["bowling"] }), now, { catalog, index: null });
    expect(explicit.map(({ poi }) => poi.id)).toEqual(["fixture:a-bowling"]);
  });

  it.each(["student", "tourist", "family"] as const)("%s never reintroduces a saved coffee venue through the actual recommend path", async (profileId) => {
    const input = request(profileId, { query: "Боулинг с друзьями", filters: { ...createDefaultFilters(), categories: ["bowling"] }, explicitFilterKeys: ["categories"], savedIds: [cafe.id] });
    const result = await recommend(input, { mode: "stub", now, loadCatalog: async () => catalog });
    expect(result.status).toBe("degraded");
    expect(result.recommendations.map(({ poi }) => poi.id)).toEqual(["fixture:a-bowling"]);
    expect(result.usedContext.profileId).toBe(profileId);
    expect(result.usedContext.isDemoProfile).toBe(true);
    expect(result.usedContext.filters.categories).toEqual(["bowling"]);
    expect(result.warnings).toContain("Использован демонстрационный профиль, а не история ваших посещений.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["student", "tourist", "family"] as const)("%s cannot turn an unknown price into an eligible budget match", async (profileId) => {
    const input = request(profileId, { query: "", filters: { ...createDefaultFilters(), categories: ["cafe"], maxSpendKzt: 2500 }, explicitFilterKeys: ["categories", "maxSpendKzt"], savedIds: [cafe.id] });
    const result = await recommend(input, { mode: "stub", now, loadCatalog: async () => catalog });
    expect(result.status).toBe("no_results");
    expect(result.recommendations).toEqual([]);
    expect(result.usedContext.filters.maxSpendKzt).toBe(2500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("null profile stays labelled as no demo history in the actual response", async () => {
    const result = await recommend(request(null, { query: "", filters: { ...createDefaultFilters(), categories: ["bowling"] }, explicitFilterKeys: ["categories"] }), { mode: "stub", now, loadCatalog: async () => catalog });
    expect(result.usedContext.profileId).toBeNull();
    expect(result.usedContext.isDemoProfile).toBe(false);
    expect(result.warnings.some((warning) => warning.includes("Использован демонстрационный профиль"))).toBe(false);
  });

  it("unknown stored IDs do not change ranking or exclude real eligible places", async () => {
    const baseline = await retrieve(request("student"), intent(), now, { catalog, index: null });
    const unknown = await retrieve(request("student", { savedIds: ["2gis:unknown-saved"], dismissedIds: ["2gis:unknown-hidden"] }), intent(), now, { catalog, index: null });
    expect(unknown).toEqual(baseline);
  });

  it("a dismissed saved/profile-favoured place remains absent until the user restores it", async () => {
    const hidden = await retrieve(request("student", { savedIds: [cafe.id], dismissedIds: [cafe.id] }), intent(), now, { catalog, index: null });
    expect(hidden.map(({ poi }) => poi.id)).toEqual([bowling.id]);
    const restored = await retrieve(request("student", { savedIds: [cafe.id] }), intent(), now, { catalog, index: null });
    expect(restored[0].poi.id).toBe(cafe.id);
  });
});
