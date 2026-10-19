import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "../../evals/fixtures/places.json";
import { CatalogSchema, PoiSchema } from "@/lib/contracts/poi";
import { IntentSchema, RecommendRequestSchema } from "@/lib/contracts/request";
import { RecommendResponseSchema } from "@/lib/contracts/response";
import { importCatalog, normalizeCatalog, normalizePoi } from "@/lib/data/normalize";
import { CatalogLoadError, loadCatalog } from "@/lib/data/catalog";

function realPoi() {
  const poi = structuredClone(fixtures.places[0]);
  poi.id = "2gis:unit-place";
  poi.sources[0].kind = "listing";
  return poi;
}

function request() {
  return {
    query: "тихое кафе",
    locale: "ru",
    location: { lat: 51.09, lon: 71.42, source: "preset" },
    filters: {
      categories: ["cafe"], radiusM: 2000, durationMinutes: 60,
      company: "solo", maxSpendKzt: null, openNow: false,
    },
    explicitFilterKeys: [],
    profileId: null,
    savedIds: [],
    dismissedIds: [],
  };
}

function intent() {
  return { ...request().filters, requiredFacts: [], preferredTags: [], conflict: null };
}

function response() {
  return {
    status: "ok",
    message: "Найдено одно место",
    recommendations: [{
      poi: realPoi(), distanceM: 120, distanceKind: "straight_line",
      why: "Подходит по категории", activity: "Выпить кофе",
      visitMinutes: { min: 20, max: 40, isEstimate: true },
      evidenceIds: ["source:fixture:quiet-cafe"],
      navigation: { twoGis: null, googleMaps: "https://www.google.com/maps/dir/?api=1&destination=51.09,71.42" },
    }],
    usedContext: { locationLabel: "Астана", filters: intent(), profileId: null, isDemoProfile: false, dataSnapshot: "unit-v1" },
    warnings: [],
  };
}

const tempDirs: string[] = [];
async function tempDir() {
  const directory = await mkdtemp(join(tmpdir(), "aituhack-import-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("POI provenance and unknown values", () => {
  it("accepts the explicitly synthetic fixture without inventing unknown properties", () => {
    const result = CatalogSchema.parse(fixtures);
    const unknown = result.places.find((poi) => poi.id === "fixture:unknown-cafe");
    expect(unknown).toMatchObject({ rating: null, price: null, hours: null, facts: [] });
  });

  it("preserves null hours, rating, price and address during normalization", () => {
    const result = normalizePoi({ ...realPoi(), hours: null, rating: null, price: null, address: null });
    expect(result).toMatchObject({ hours: null, rating: null, price: null, address: null });
  });

  it.each([false, true])("rejects a repeated fact key with second confirmed value %s", (secondValue) => {
    const poi = realPoi();
    poi.facts = [...poi.facts, { ...poi.facts[0], value: secondValue }];
    expect(PoiSchema.safeParse(poi).success).toBe(false);
  });

  it.each([
    ["latitude", (poi: ReturnType<typeof realPoi>) => { poi.location.lat = 91; }],
    ["longitude", (poi: ReturnType<typeof realPoi>) => { poi.location.lon = -181; }],
    ["nonfinite coordinate", (poi: ReturnType<typeof realPoi>) => { poi.location.lat = Infinity; }],
    ["unknown category", (poi: ReturnType<typeof realPoi>) => { poi.category = "gym"; }],
    ["unnamespaced place ID", (poi: ReturnType<typeof realPoi>) => { poi.id = "123"; }],
    ["missing sources", (poi: ReturnType<typeof realPoi>) => { poi.sources = []; }],
    ["duplicate source IDs", (poi: ReturnType<typeof realPoi>) => { poi.sources.push({ ...poi.sources[0] }); }],
    ["unresolved description source", (poi: ReturnType<typeof realPoi>) => { poi.description.sourceIds = ["missing"]; }],
    ["unresolved rating source", (poi: ReturnType<typeof realPoi>) => { poi.rating!.sourceIds = ["missing"]; }],
    ["unresolved fact source", (poi: ReturnType<typeof realPoi>) => { poi.facts[0].sourceIds = ["missing"]; }],
    ["unresolved review source", (poi: ReturnType<typeof realPoi>) => { poi.reviews[0].sourceIds = ["missing"]; }],
    ["inverted price", (poi: ReturnType<typeof realPoi>) => { poi.price!.max = 1; }],
    ["invalid rating", (poi: ReturnType<typeof realPoi>) => { poi.rating!.value = 5.1; }],
    ["fractional review count", (poi: ReturnType<typeof realPoi>) => { poi.rating!.count = 1.2; }],
    ["non-ISO collected time", (poi: ReturnType<typeof realPoi>) => { poi.sources[0].collectedAt = "yesterday"; }],
    ["invalid clock", (poi: ReturnType<typeof realPoi>) => { poi.hours!.weekly[0].opens = "25:00"; }],
    ["backwards same-day hours", (poi: ReturnType<typeof realPoi>) => { poi.hours!.weekly[0].closes = "08:00"; }],
    ["insecure displayed URL", (poi: ReturnType<typeof realPoi>) => { Object.assign(poi.links, { website: "http://example.com" }); }],
    ["unsafe provenance URL", (poi: ReturnType<typeof realPoi>) => { poi.sources[0].url = "javascript:alert(1)"; }],
  ])("rejects %s", (_name, change) => {
    const poi = realPoi();
    change(poi);
    expect(() => normalizePoi(poi)).toThrow();
  });

  it("allows HTTP provenance but requires HTTPS for displayed social links", () => {
    const poi = realPoi();
    poi.sources[0].url = "http://example.com/listing";
    expect(PoiSchema.safeParse(poi).success).toBe(true);
    const invalid = { ...poi, links: { ...poi.links, social: [{ label: "Пост", url: "http://example.com/post", sourceIds: [poi.sources[0].id] }] } };
    expect(PoiSchema.safeParse(invalid).success).toBe(false);
  });

  it("does not resolve a POI source reference against another POI", () => {
    const first = realPoi();
    const second = realPoi();
    second.id = "2gis:second";
    second.description.sourceIds = ["another-place-only"];
    first.sources.push({ ...first.sources[0], id: "another-place-only" });
    expect(CatalogSchema.safeParse({ schemaVersion: "1.0", synthetic: false, places: [first, second] }).success).toBe(false);
  });

  it("rejects duplicate place IDs and synthetic provenance in a real catalogue", () => {
    expect(CatalogSchema.safeParse({ ...fixtures, places: [fixtures.places[0], fixtures.places[0]] }).success).toBe(false);
    expect(CatalogSchema.safeParse({ ...fixtures, synthetic: false }).success).toBe(false);
  });
});

describe("catalogue import reporting", () => {
  it.each([false, true])("rejects a POI row with duplicate confirmed fact value %s", (secondValue) => {
    const invalid = realPoi();
    invalid.facts = [...invalid.facts, { ...invalid.facts[0], value: secondValue }];
    const valid = { ...realPoi(), id: "2gis:valid-unique-facts" };
    const { catalog, report } = normalizeCatalog({ schemaVersion: "1.0", synthetic: false, places: [invalid, valid] });
    expect(catalog.places.map((poi) => poi.id)).toEqual(["2gis:valid-unique-facts"]);
    expect(report).toMatchObject({ fetched: 2, accepted: 1, rejected: 1 });
    expect(report.rejections[0]).toMatchObject({ index: 0, reason: "invalid_poi" });
    expect(report.rejections[0].issues.some((issue) => issue.path.startsWith("facts"))).toBe(true);
  });

  it("accepts a valid row, rejects both duplicate-ID rows and reports null properties", () => {
    const distinct = { ...realPoi(), id: "2gis:distinct", rating: null, price: null, hours: null };
    const { catalog, report } = normalizeCatalog({ schemaVersion: "1.0", synthetic: false, places: [realPoi(), realPoi(), distinct] });
    expect(catalog.places.map((poi) => poi.id)).toEqual(["2gis:distinct"]);
    expect(report).toMatchObject({ fetched: 3, accepted: 1, rejected: 2, missingFields: { rating: 1, price: 1, hours: 1 }, byCategory: { cafe: 1 }, byZone: { unknown: 1 } });
    expect(report.rejections.map((row) => row.reason)).toEqual(["duplicate_id", "duplicate_id"]);
  });

  it("rejects malformed coordinates without substituting a default location", () => {
    const poi = realPoi();
    poi.location.lat = NaN;
    const { catalog, report } = importCatalog({ schemaVersion: "1.0", synthetic: false, places: [poi] });
    expect(catalog.places).toEqual([]);
    expect(report).toMatchObject({ fetched: 1, accepted: 0, rejected: 1 });
    expect(report.rejections[0].issues.some((issue) => issue.path.includes("location"))).toBe(true);
  });

  it("rejects synthetic rows from a real import", () => {
    const { catalog, report } = normalizeCatalog({ ...fixtures, synthetic: false });
    expect(catalog.places).toEqual([]);
    expect(report.rejected).toBe(8);
  });

  it("reports a malformed source URL as a rejected row without crashing the batch", () => {
    const invalid = realPoi();
    invalid.sources[0].url = "not a URL";
    const { catalog, report } = normalizeCatalog({ schemaVersion: "1.0", synthetic: false, places: [{ ...realPoi(), id: "2gis:valid" }, invalid] });
    expect(catalog.places.map((poi) => poi.id)).toEqual(["2gis:valid"]);
    expect(report).toMatchObject({ accepted: 1, rejected: 1 });
  });

  it("reports a nearby row missing its stable ID for manual duplicate review", () => {
    const missing = { ...realPoi(), id: "", location: { lat: 51.09001, lon: 71.42 } };
    const { catalog, report } = normalizeCatalog({ schemaVersion: "1.0", synthetic: false, places: [realPoi(), missing] });
    expect(catalog.places).toHaveLength(1);
    expect(report.suspectedDuplicates).toEqual([expect.objectContaining({ indexes: [0, 1], reason: "same_name_nearby" })]);
  });

  it("does not silently reinterpret a raw collector array as a catalogue", () => {
    expect(() => normalizeCatalog([realPoi()])).toThrow();
  });

  it("runs the importer CLI and writes validated output plus a separate report", async () => {
    const directory = await tempDir();
    const output = join(directory, "catalog.json");
    const reportPath = join(directory, "report.json");
    execFileSync(process.execPath, ["--import", "tsx", "scripts/import-poi.ts", "--input", "evals/fixtures/places.json", "--output", output, "--report", reportPath], { cwd: resolve("."), encoding: "utf8" });
    expect(CatalogSchema.parse(JSON.parse(await readFile(output, "utf8"))).synthetic).toBe(true);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({ fetched: 8, accepted: 8, rejected: 0 });
  });
});

describe("bounded request and grounded response contracts", () => {
  it("accepts the agreed request and intent without changing explicit filters", () => {
    expect(RecommendRequestSchema.parse(request()).filters.radiusM).toBe(2000);
    expect(IntentSchema.parse(intent()).conflict).toBeNull();
  });

  it.each([
    ["oversized query", () => ({ ...request(), query: "а".repeat(1001) })],
    ["empty query without category", () => ({ ...request(), query: "  ", filters: { ...request().filters, categories: [] } })],
    ["unknown explicit filter", () => ({ ...request(), explicitFilterKeys: ["now"] })],
    ["spoofed server time", () => ({ ...request(), now: "2026-10-19T12:00:00Z" })],
    ["invalid radius", () => ({ ...request(), filters: { ...request().filters, radiusM: 1500 } })],
    ["negative budget", () => ({ ...request(), filters: { ...request().filters, maxSpendKzt: -1 } })],
    ["too many saved IDs", () => ({ ...request(), savedIds: Array.from({ length: 101 }, (_, i) => `2gis:${i}`) })],
    ["body exceeding 16KB", () => ({ ...request(), savedIds: Array.from({ length: 100 }, (_, i) => `2gis:${i}${"a".repeat(200)}`) })],
  ])("rejects %s", (_name, makeInput) => {
    expect(RecommendRequestSchema.safeParse(makeInput()).success).toBe(false);
  });

  it("accepts an internally grounded recommendation", () => {
    expect(RecommendResponseSchema.parse(response()).recommendations).toHaveLength(1);
  });

  it.each([
    ["too many recommendations", () => { const r = response(); r.recommendations = Array.from({ length: 4 }, () => r.recommendations[0]); return r; }],
    ["unknown evidence", () => { const r = response(); r.recommendations[0].evidenceIds = ["missing"]; return r; }],
    ["negative distance", () => { const r = response(); r.recommendations[0].distanceM = -1; return r; }],
    ["unlabelled estimate", () => { const r = response(); r.recommendations[0].visitMinutes.isEstimate = false; return r; }],
    ["inverted duration", () => { const r = response(); r.recommendations[0].visitMinutes.min = 50; return r; }],
    ["duration beyond requested limit", () => { const r = response(); r.recommendations[0].visitMinutes.max = 90; return r; }],
    ["cards on clarification", () => ({ ...response(), status: "needs_clarification" })],
    ["cards on no-results", () => ({ ...response(), status: "no_results" })],
    ["duplicate recommendation IDs", () => { const r = response(); r.recommendations.push(r.recommendations[0]); return r; }],
    ["insecure navigation", () => { const r = response(); r.recommendations[0].navigation.googleMaps = "http://www.google.com/maps"; return r; }],
  ])("rejects %s", (_name, makeInput) => {
    expect(RecommendResponseSchema.safeParse(makeInput()).success).toBe(false);
  });
});

describe("server catalogue loading", () => {
  it("returns a typed safe error for an absent configured catalogue without fixture fallback", async () => {
    vi.stubEnv("APP_USE_SYNTHETIC", "false");
    vi.stubEnv("APP_DATASET_PATH", join(await tempDir(), "missing.json"));
    await expect(loadCatalog()).rejects.toBeInstanceOf(CatalogLoadError);
    await expect(loadCatalog()).rejects.toMatchObject({ code: "CATALOG_NOT_FOUND" });
  });

  it("loads synthetic fixtures only after explicit opt-in", async () => {
    vi.stubEnv("APP_USE_SYNTHETIC", "true");
    vi.stubEnv("APP_DATASET_PATH", undefined);
    expect(await loadCatalog()).toMatchObject({ synthetic: true, places: expect.any(Array) });
  });

  it("rejects an explicitly configured synthetic catalogue when opt-in is absent", async () => {
    vi.stubEnv("APP_USE_SYNTHETIC", "false");
    vi.stubEnv("APP_DATASET_PATH", "evals/fixtures/places.json");
    await expect(loadCatalog()).rejects.toMatchObject({ code: "SYNTHETIC_NOT_ENABLED" });
  });

  it("validates real files and classifies malformed JSON safely", async () => {
    const path = join(await tempDir(), "catalog.json");
    vi.stubEnv("APP_USE_SYNTHETIC", "false");
    vi.stubEnv("APP_DATASET_PATH", path);
    await writeFile(path, JSON.stringify({ schemaVersion: "1.0", synthetic: false, places: [realPoi()] }));
    expect((await loadCatalog()).places[0].id).toBe("2gis:unit-place");
    await writeFile(path, "{invalid json");
    await expect(loadCatalog()).rejects.toMatchObject({ code: "CATALOG_INVALID" });
  });
});
