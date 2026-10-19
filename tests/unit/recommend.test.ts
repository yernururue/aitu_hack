// Real-catalogue smoke is local only; every provider is injected.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogSchema, PoiSchema, type Catalog } from "@/lib/contracts/poi";
import { createDefaultFilters, type Intent, type RecommendRequest } from "@/lib/contracts/request";
import { RecommendResponseSchema } from "@/lib/contracts/response";
import { CatalogLoadError } from "@/lib/data/catalog";
import { canonicalDatasetHash } from "@/lib/search/index";
import * as searchIndex from "@/lib/search/index";
import type { RankedPoi } from "@/lib/search/rank";
import type { ChatJson } from "@/lib/ai/openrouter";
import * as openrouter from "@/lib/ai/openrouter";
import * as transport from "@/lib/ai/transport";
import { recommend } from "@/lib/recommend";

const now = new Date("2026-10-20T10:00:00Z");
const origin = { lat: 51.09, lon: 71.418, source: "preset" as const };
function unitPoi(id = "fixture:eligible") {
  const sourceId = `source:${id}`;
  return PoiSchema.parse({
    id, name: "Synthetic unit cafe", category: "cafe", location: { lat: origin.lat, lon: origin.lon },
    description: { text: "Тестовое описание", sourceIds: [sourceId] }, tags: ["кафе"],
    address: null, rating: null, price: null, hours: null, facts: [], links: { twoGis: null, website: null, social: [] }, reviews: [],
    sources: [{ id: sourceId, kind: "synthetic", url: "https://example.com/unit", collectedAt: now.toISOString(), publishedAt: null }],
  });
}
const catalog = CatalogSchema.parse({ schemaVersion: "1.0", synthetic: true, places: [unitPoi(), unitPoi("fixture:other")] });
function request(overrides: Partial<RecommendRequest> = {}): RecommendRequest {
  return { query: "Кафе", locale: "ru", location: origin, filters: { ...createDefaultFilters(), categories: ["cafe"] }, explicitFilterKeys: ["categories"], profileId: null, savedIds: [], dismissedIds: [], ...overrides };
}
function intent(overrides: Partial<Intent> = {}): Intent {
  return { ...request().filters, requiredFacts: [], preferredTags: [], conflict: null, ...overrides };
}
function modelItem(id = "fixture:eligible") {
  return { poiId: id, why: "Подходит по выбранной категории.", activity: "Можно выпить кофе.", evidenceIds: [`source:${id}`] };
}
function ranked(): RankedPoi[] {
  return [{ poi: catalog.places[0], distanceM: 0, score: 0.5, visitMinutes: { min: 20, max: 30, isEstimate: true } }];
}
type RetrievalStub = (request: RecommendRequest, intent: Intent, now: Date, context: {
  catalog: Catalog; mode: "disabled" | "stub" | "live"; deadlineAt: number; signal?: AbortSignal; purpose?: "prep" | "live_eval" | "demo";
}) => Promise<{ candidates: RankedPoi[]; mode: "semantic" | "lexical"; warnings: string[]; dataSnapshot: string }>;
function retrieval(mode: "semantic" | "lexical" = "semantic"): RetrievalStub {
  return async () => ({ candidates: ranked(), mode, warnings: mode === "lexical" ? ["Использован лексический поиск."] : [], dataSnapshot: canonicalDatasetHash(catalog) });
}
function chat(): ChatJson {
  return async ({ stage }) => stage === "intent" ? intent() : { items: [modelItem()] };
}
function deps() {
  return { mode: "live" as const, now, deadlineAt: now.getTime() + 25_000, loadCatalog: async () => catalog, chatJson: chat(), retrieve: retrieval() };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("APP_AI_MODE", "disabled"); vi.stubEnv("OPENROUTER_PAID_ENABLED", "false"); vi.stubEnv("LIVE_EVAL_ENABLED", "false");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
  vi.spyOn(transport, "createLiveTransport").mockImplementation(() => { throw new Error("LIVE_FACTORY_FORBIDDEN"); });
  vi.spyOn(openrouter, "createChatJson").mockImplementation(() => { throw new Error("CHAT_FACTORY_FORBIDDEN"); });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("stage-specific safe failure", () => {
  it.each(["UPSTREAM_TIMEOUT", "UPSTREAM_RATE_LIMITED", "COST_UNKNOWN", "PAID_CALLS_DISABLED"])("clarifies intent %s without retrieval or explanation", async (code) => {
    const retrieve = vi.fn<RetrievalStub>();
    const chatJson = vi.fn<ChatJson>(async () => { throw Object.assign(new Error("FAKE_UPSTREAM_SECRET"), { code }); });
    const result = await recommend(request({ query: "Кафе до 1000 тенге" }), { ...deps(), retrieve, chatJson });
    expect(RecommendResponseSchema.parse(result)).toMatchObject({ status: "needs_clarification", recommendations: [] });
    expect(retrieve).not.toHaveBeenCalled(); expect(chatJson).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("FAKE_UPSTREAM_SECRET");
  });

  it.each([
    "{\"items\":[",
    { items: [modelItem("evil:unknown")] },
    { items: [{ ...modelItem(), evidenceIds: ["source:fixture:other"] }] },
    { items: [] },
    { items: [{ ...modelItem(), rating: 5 }] },
  ])("degrades a malformed or ungrounded explanation to already-filtered catalogue facts", async (payload) => {
    const chatJson = vi.fn<ChatJson>(async ({ stage }) => stage === "intent" ? intent() : payload);
    const result = await recommend(request(), { ...deps(), chatJson });
    expect(RecommendResponseSchema.parse(result)).toMatchObject({ status: "degraded", recommendations: [{ poi: { id: "fixture:eligible", rating: null, price: null, hours: null } }] });
    expect(result.recommendations[0].poi).toEqual(catalog.places[0]);
    expect(result.recommendations[0].evidenceIds.every((id) => catalog.places[0].sources.some((s) => s.id === id))).toBe(true);
    expect(chatJson.mock.calls.filter(([call]) => call.stage === "explanation")).toHaveLength(1);
  });

  it.each(["UPSTREAM_TIMEOUT", "UPSTREAM_RATE_LIMITED", "COST_UNKNOWN"])("degrades final explanation %s without a core retry", async (code) => {
    const chatJson = vi.fn<ChatJson>(async ({ stage }) => {
      if (stage === "intent") return intent();
      throw Object.assign(new Error("FAKE_UPSTREAM_SECRET"), { code });
    });
    const result = await recommend(request(), { ...deps(), chatJson });
    expect(result.status).toBe("degraded"); expect(result.recommendations).toHaveLength(1);
    expect(chatJson).toHaveBeenCalledTimes(2); expect(JSON.stringify(result)).not.toContain("FAKE_UPSTREAM_SECRET");
  });

  it("keeps extracted limits when query embedding falls back to lexical ranking", async () => {
    const extracted = intent({ radiusM: 1000, durationMinutes: 30, maxSpendKzt: 2000, requiredFacts: ["outlets"] });
    const retrieve = vi.fn<RetrievalStub>(async (_request, applied) => {
      expect(applied).toEqual(extracted);
      return { candidates: [], mode: "lexical", warnings: ["Эмбеддинги недоступны; лексический поиск."], dataSnapshot: canonicalDatasetHash(catalog) };
    });
    const chatJson = vi.fn<ChatJson>(async () => extracted);
    const result = await recommend(request({ explicitFilterKeys: ["categories"] }), { ...deps(), chatJson, retrieve });
    expect(result).toMatchObject({ status: "no_results", recommendations: [], usedContext: { filters: extracted } });
    expect(result.warnings.join(" ")).toMatch(/лексическ/i); expect(chatJson).toHaveBeenCalledOnce();
  });

  it("returns zero cards when a noun-form quiet requirement cannot be safely confirmed", async () => {
    const retrieve = vi.fn<RetrievalStub>(retrieval());
    const chatJson = vi.fn<ChatJson>(async () => intent({ requiredFacts: ["quiet"] }));
    const result = await recommend(request({ query: "Обязательна тишина в кафе" }), { ...deps(), chatJson, retrieve });
    expect(result).toMatchObject({ status: "needs_clarification", recommendations: [] });
    expect(retrieve).not.toHaveBeenCalled(); expect(chatJson).toHaveBeenCalledOnce();
  });

  it("does not fabricate fallback POIs when hard constraints have no match", async () => {
    const retrieve: RetrievalStub = async () => ({ candidates: [], mode: "semantic", warnings: [], dataSnapshot: canonicalDatasetHash(catalog) });
    const chatJson = vi.fn<ChatJson>(async () => intent());
    const result = await recommend(request(), { ...deps(), retrieve, chatJson });
    expect(result.status).toBe("no_results"); expect(result.recommendations).toEqual([]); expect(chatJson).toHaveBeenCalledOnce();
  });
});

describe("real catalogue offline behaviour with honest disclosure", () => {
  it.each(["", "Кофе рядом"])("returns real local catalogue IDs for a category/known phrase: %s", async (query) => {
    const real = CatalogSchema.parse(JSON.parse(readFileSync("data/catalog/places.json", "utf8")));
    vi.stubEnv("OPENROUTER_PAID_ENABLED", "true"); // Explicit stub still bypasses every live factory.
    const chatJson = vi.fn<ChatJson>();
    const result = await recommend(request({ query }), { mode: "stub", now, deadlineAt: now.getTime() + 25_000, loadCatalog: async () => real, chatJson });
    expect(RecommendResponseSchema.parse(result).status).toBe("degraded");
    expect(result.recommendations.length).toBeGreaterThan(0); expect(result.recommendations.length).toBeLessThanOrEqual(3);
    expect(result.recommendations.every((r) => real.places.some((p) => p.id === r.poi.id) && !r.poi.id.startsWith("fixture:"))).toBe(true);
    expect(result.usedContext.dataSnapshot).toBe(canonicalDatasetHash(real));
    expect(result.warnings.join(" ")).toMatch(/демо|ИИ|AI/i); expect(result.warnings.join(" ")).toMatch(/лексическ/i);
    expect(chatJson).not.toHaveBeenCalled(); expect(openrouter.createChatJson).not.toHaveBeenCalled(); expect(transport.createLiveTransport).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("uses local categories in disabled mode but clarifies every nonempty unavailable query", async () => {
    const local = await recommend(request({ query: "" }), { ...deps(), mode: "disabled" });
    expect(local.recommendations).toHaveLength(1); expect(local.status).toBe("degraded");
    const unknown = await recommend(request({ query: "Кофе рядом до 1000, обязательно с розеткой" }), { ...deps(), mode: "disabled" });
    expect(unknown).toMatchObject({ status: "needs_clarification", recommendations: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not discard an unknown stub suffix even when a category is selected", async () => {
    const result = await recommend(request({ query: "Кофе рядом до 1000 тенге" }), { ...deps(), mode: "stub" });
    expect(result).toMatchObject({ status: "needs_clarification", recommendations: [] });
  });

  it("does not invent confirmed outlets in the real catalogue for the known stub phrase", async () => {
    const real = CatalogSchema.parse(JSON.parse(readFileSync("data/catalog/places.json", "utf8")));
    const result = await recommend(request({ query: "Кафе с розеткой" }), { mode: "stub", now, loadCatalog: async () => real });
    expect(result).toMatchObject({ status: "no_results", recommendations: [], usedContext: { filters: { requiredFacts: ["outlets"] } } });
  });

  it("treats an unknown configured mode as disabled rather than live or stub", async () => {
    vi.stubEnv("APP_AI_MODE", "unknown-mode");
    const result = await recommend(request({ query: "Кофе рядом" }), { now, loadCatalog: async () => catalog });
    expect(result).toMatchObject({ status: "needs_clarification", recommendations: [] });
    expect(transport.createLiveTransport).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("labels a selected demo profile while retaining code-only navigation and visit estimates", async () => {
    const result = await recommend(request({ profileId: "student" }), deps());
    expect(result.usedContext).toMatchObject({ profileId: "student", isDemoProfile: true });
    expect(result.recommendations[0]).toMatchObject({ poi: catalog.places[0], distanceM: 0, distanceKind: "straight_line", visitMinutes: { min: 20, max: 30, isEstimate: true } });
    const destination = new URL(result.recommendations[0].navigation.googleMaps);
    expect(destination.protocol).toBe("https:"); expect(destination.hostname).toMatch(/(^|\.)google\.com$/);
    // twoGis:null is valid until the separately owned M5 navigation integration.
    expect(result.warnings.join(" ")).toMatch(/цен|час|расписан/i);
  });

  it("propagates typed catalogue failure for the HTTP layer to sanitize as503", async () => {
    await expect(recommend(request(), { ...deps(), loadCatalog: async () => { throw new CatalogLoadError("CATALOG_NOT_FOUND"); } })).rejects.toMatchObject({ code: "CATALOG_NOT_FOUND" });
  });
});

describe("guarded query embedding integration", () => {
  function validIndex() {
    const values = Array.from({ length: searchIndex.DEFAULT_EMBEDDING_DIMENSIONS }, (_, i) => i === 0 ? 1 : 0);
    return { schemaVersion: "1.0" as const, model: searchIndex.DEFAULT_EMBEDDING_MODEL, dimensions: values.length,
      documentVersion: "poi-v1" as const, datasetHash: canonicalDatasetHash(catalog),
      vectors: catalog.places.map((poi) => ({ poiId: poi.id, values: [...values] })) };
  }

  it("passes the original deadline, linked abort signal and15-second attempt bound to guarded embedding", async () => {
    vi.spyOn(searchIndex, "loadIndex").mockResolvedValue(validIndex());
    const execute = vi.fn<transport.GuardedTransport["execute"]>(async () => ({
      model: searchIndex.DEFAULT_EMBEDDING_MODEL,
      data: [{ index: 0, embedding: validIndex().vectors[0].values }],
    }));
    vi.mocked(transport.createLiveTransport).mockReturnValue({ execute } as unknown as transport.GuardedTransport);
    const abort = new AbortController();
    const deadlineAt = now.getTime() + 25_000;
    const result = await recommend(request(), { ...deps(), retrieve: undefined, signal: abort.signal, deadlineAt });
    expect(result.recommendations).toHaveLength(1);
    expect(execute).toHaveBeenCalledOnce();
    const dispatched = execute.mock.calls[0][0];
    expect(dispatched).toMatchObject({ deadlineAt, timeoutMs: 15_000, purpose: "prep", quote: { operation: "query_embedding" }, body: { input: ["Кафе"] } });
    expect(dispatched.signal).toBeInstanceOf(AbortSignal); expect(dispatched.signal?.aborted).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards client abort into an in-flight query embedding and starts no late explanation", async () => {
    vi.spyOn(searchIndex, "loadIndex").mockResolvedValue(validIndex());
    let finishEmbedding: ((value: unknown) => void) | undefined;
    const execute = vi.fn<transport.GuardedTransport["execute"]>(() => new Promise((resolve) => { finishEmbedding = resolve; }));
    vi.mocked(transport.createLiveTransport).mockReturnValue({ execute } as unknown as transport.GuardedTransport);
    const chatJson = vi.fn<ChatJson>(chat()); const controller = new AbortController();
    const pending = recommend(request(), { ...deps(), retrieve: undefined, chatJson, signal: controller.signal }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1); expect(execute).toHaveBeenCalledOnce();
    const embeddedSignal = execute.mock.calls[0][0].signal;
    controller.abort(); await vi.advanceTimersByTimeAsync(1); await pending;
    expect(embeddedSignal?.aborted).toBe(true);
    finishEmbedding?.({ model: searchIndex.DEFAULT_EMBEDDING_MODEL, data: [{ index: 0, embedding: validIndex().vectors[0].values }] });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chatJson).toHaveBeenCalledOnce(); expect(execute).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["timeout", "http"] as const)("keeps extracted constraints and degrades lexically after embedding %s failure", async (reason) => {
    vi.spyOn(searchIndex, "loadIndex").mockResolvedValue(validIndex());
    const execute = vi.fn<transport.GuardedTransport["execute"]>(async () => {
      throw new transport.TransportError("FAKE_EMBEDDING_ERROR", reason, { dispatched: true, costKnown: reason === "http", ...(reason === "http" ? { status: 429 } : {}) });
    });
    vi.mocked(transport.createLiveTransport).mockReturnValue({ execute } as unknown as transport.GuardedTransport);
    const extracted = intent({ radiusM: 1000, durationMinutes: 30, company: "friends" });
    const chatJson: ChatJson = async ({ stage }) => stage === "intent" ? extracted : { items: [modelItem()] };
    const result = await recommend(request(), { ...deps(), retrieve: undefined, chatJson });
    expect(result).toMatchObject({ status: "degraded", usedContext: { filters: extracted } });
    expect(result.recommendations).toHaveLength(1); expect(result.recommendations[0].visitMinutes.max).toBeLessThanOrEqual(30);
    expect(result.warnings.join(" ")).toMatch(/лексическ/i); expect(execute).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  });
});

describe("one shared deadline through intent, query embedding and explanation", () => {
  it("does not dispatch retrieval or explanation after aborting an in-flight intent", async () => {
    const controller = new AbortController();
    let finishIntent: ((value: Intent) => void) | undefined;
    const chatJson = vi.fn<ChatJson>(() => new Promise<Intent>((resolve) => { finishIntent = resolve; }));
    const retrieve = vi.fn<RetrievalStub>(retrieval());
    const pending = recommend(request(), { ...deps(), signal: controller.signal, chatJson, retrieve }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1);
    expect(chatJson).toHaveBeenCalledOnce();
    controller.abort(); await vi.advanceTimersByTimeAsync(1);
    const outcome = await pending;
    if (outcome) expect(outcome.recommendations).toEqual([]);
    finishIntent?.(intent()); await vi.advanceTimersByTimeAsync(30_000);
    expect(retrieve).not.toHaveBeenCalled(); expect(chatJson).toHaveBeenCalledOnce();
  });

  it("does not reset the25-second clock after an earlier stage consumes time", async () => {
    const deadlineAt = now.getTime() + 25_000;
    const observed: number[] = [];
    const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const chatJson = vi.fn<ChatJson>(async (call) => {
      observed.push(call.deadlineAt);
      await delay(10_000); // Deliberately ignores abort: core must still bound its response.
      return call.stage === "intent" ? intent() : { items: [modelItem()] };
    });
    const retrieve: RetrievalStub = async (_request, _intent, _now, context) => {
      observed.push(context.deadlineAt); await delay(10_000);
      return { candidates: ranked(), mode: "lexical", warnings: ["Лексический fallback."], dataSnapshot: canonicalDatasetHash(catalog) };
    };
    const pending = recommend(request(), { ...deps(), chatJson, retrieve, deadlineAt });
    await vi.advanceTimersByTimeAsync(25_001);
    const result = await pending;
    expect(result.status).toBe("degraded"); expect(result.recommendations).toHaveLength(1);
    expect(observed).toEqual([deadlineAt, deadlineAt, deadlineAt]);
    expect(chatJson).toHaveBeenCalledTimes(2); expect(Date.now()).toBeLessThan(now.getTime() + 26_000);
  });
});
