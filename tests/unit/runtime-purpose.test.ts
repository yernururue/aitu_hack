import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rawFixture from "../../evals/fixtures/places.json";
import { readAiConfig } from "@/lib/ai/config";
import { POST } from "@/app/api/recommend/route";
import { CatalogSchema } from "@/lib/contracts/poi";
import { createDefaultFilters, type RecommendRequest } from "@/lib/contracts/request";
import { RecommendResponseSchema } from "@/lib/contracts/response";
import * as core from "@/lib/recommend";
import * as catalogue from "@/lib/data/catalog";
import * as openrouter from "@/lib/ai/openrouter";
import * as transport from "@/lib/ai/transport";

function payload(): RecommendRequest {
  return { query: "", locale: "ru", location: { lat: 51.09, lon: 71.418, source: "preset" }, filters: { ...createDefaultFilters(), categories: ["cafe"] }, explicitFilterKeys: ["categories"], profileId: null, savedIds: [], dismissedIds: [] };
}
function request(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), ...extra }) });
}
function response() {
  return RecommendResponseSchema.parse({ status: "no_results", message: "Тестовый ответ без сети.", recommendations: [], usedContext: { locationLabel: "EXPO", filters: { ...payload().filters, requiredFacts: [], preferredTags: [], conflict: null }, profileId: null, isDemoProfile: false, dataSnapshot: "unit-purpose-catalog" }, warnings: [] });
}

beforeEach(() => {
  // Explicit test-only values: never load a real env file or touch a real ledger.
  for (const [name, value] of Object.entries({ APP_AI_MODE: "stub", OPENROUTER_PAID_ENABLED: "false", OPENROUTER_API_KEY: "test-only-not-a-key", OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1", OPENROUTER_STORAGE: "single_host_persistent", OPENROUTER_LEDGER_PATH: "/tmp/aituhack-purpose-unused-ledger.json", OPENROUTER_PREP_MAX_USD: "2", OPENROUTER_DEMO_RESERVE_USD: "4", LIVE_EVAL_ENABLED: "false", LIVE_EVAL_MAX_USD: "0.5", VERCEL: "", AWS_LAMBDA_FUNCTION_NAME: "", NETLIFY: "" })) vi.stubEnv(name, value);
  vi.stubEnv("OPENROUTER_RUNTIME_PURPOSE", undefined);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("NETWORK_FORBIDDEN")));
  vi.spyOn(openrouter, "createChatJson").mockImplementation(() => { throw new Error("LIVE_FACTORY_FORBIDDEN"); });
  vi.spyOn(transport, "createLiveTransport").mockImplementation(() => { throw new Error("LIVE_FACTORY_FORBIDDEN"); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("server-only runtime purpose configuration", () => {
  it("defaults to prep without enabling payment or changing hard caps", () => {
    expect(readAiConfig({})).toMatchObject({ runtimePurpose: "prep", paidEnabled: false, caps: { prep: 2, live_eval: 1, demo: 4 } });
  });
  it.each(["prep", "demo"] as const)("accepts explicit %s only from server env", (purpose) => {
    expect(readAiConfig({ OPENROUTER_RUNTIME_PURPOSE: purpose }).runtimePurpose).toBe(purpose);
  });
  it.each(["", "live_eval", "development", "Demo", " demo"])("fails closed for invalid runtime purpose %j", (purpose) => {
    expect(() => readAiConfig({ OPENROUTER_RUNTIME_PURPOSE: purpose })).toThrow("INVALID_RUNTIME_PURPOSE");
  });
  it("rejects a public-prefixed purpose setting", () => {
    expect(() => readAiConfig({ NEXT_PUBLIC_OPENROUTER_RUNTIME_PURPOSE: "demo" })).toThrow("PUBLIC_AI_CONFIGURATION");
  });
});

describe("actual route boundary forwards server purpose", () => {
  it.each([undefined, "prep", "demo"] as const)("passes purpose %s with the existing server deadline and signal", async (purpose) => {
    vi.stubEnv("OPENROUTER_RUNTIME_PURPOSE", purpose);
    const recommend = vi.spyOn(core, "recommend").mockResolvedValue(response());
    const result = await POST(request());
    expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(recommend).toHaveBeenCalledOnce();
    const context = recommend.mock.calls[0][1]!;
    expect(context).toMatchObject({ purpose: purpose ?? "prep", now: expect.any(Date), signal: expect.any(AbortSignal) });
    expect(context.deadlineAt).toBe(context.now!.getTime() + 25_000);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads purpose at request time rather than capturing a build/module value", async () => {
    const recommend = vi.spyOn(core, "recommend").mockResolvedValue(response());
    vi.stubEnv("OPENROUTER_RUNTIME_PURPOSE", "prep"); await POST(request());
    vi.stubEnv("OPENROUTER_RUNTIME_PURPOSE", "demo"); await POST(request());
    expect(recommend.mock.calls.map((call) => call[1]?.purpose)).toEqual(["prep", "demo"]);
  });
  it("returns sanitized503 without reaching the core for invalid server purpose", async () => {
    vi.stubEnv("OPENROUTER_RUNTIME_PURPOSE", "invalid-purpose-marker");
    const recommend = vi.spyOn(core, "recommend").mockResolvedValue(response());
    const result = await POST(request());
    expect(result.status).toBe(503); expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.text()).not.toContain("invalid-purpose-marker");
    expect(recommend).not.toHaveBeenCalled();
    expect(transport.createLiveTransport).not.toHaveBeenCalled(); expect(openrouter.createChatJson).not.toHaveBeenCalled();
  });
  it.each([["purpose", "demo"], ["model", "client-model"], ["provider", {}], ["now", "2000-01-01T00:00:00Z"], ["index", {}]] as const)("rejects client override %s before the core", async (key, value) => {
    const recommend = vi.spyOn(core, "recommend").mockResolvedValue(response());
    const result = await POST(request({ [key]: value }));
    expect(result.status).toBe(400); expect(recommend).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["stub", "disabled"])("does not construct live factories in %s even with paid=true and demo purpose", async (mode) => {
    vi.stubEnv("APP_AI_MODE", mode); vi.stubEnv("OPENROUTER_PAID_ENABLED", "true"); vi.stubEnv("OPENROUTER_RUNTIME_PURPOSE", "demo");
    vi.spyOn(catalogue, "loadCatalog").mockResolvedValue(CatalogSchema.parse(rawFixture));
    const result = await POST(request());
    expect(result.status).toBe(200);
    RecommendResponseSchema.parse(await result.json());
    expect(transport.createLiveTransport).not.toHaveBeenCalled(); expect(openrouter.createChatJson).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
});
