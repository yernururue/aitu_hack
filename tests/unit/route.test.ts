// Approved server-only factory; app route exports only POST/runtime.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogSchema } from "@/lib/contracts/poi";
import { POST } from "@/app/api/recommend/route";
import { createDefaultFilters, type RecommendRequest } from "@/lib/contracts/request";
import { RecommendResponseSchema, type RecommendResponse } from "@/lib/contracts/response";
import { createRecommendHandler } from "@/lib/recommend";

const serverNow = new Date("2026-10-20T10:00:00Z");
type Core = (input: RecommendRequest, context: { now: Date; deadlineAt: number; signal: AbortSignal }) => Promise<RecommendResponse>;
function payload(): RecommendRequest {
  return { query: "", locale: "ru", location: { lat: 51.09, lon: 71.418, source: "preset" }, filters: { ...createDefaultFilters(), categories: ["cafe"] }, explicitFilterKeys: ["categories"], profileId: null, savedIds: [], dismissedIds: [] };
}
function domainResponse(): RecommendResponse {
  return RecommendResponseSchema.parse({ status: "no_results", message: "По заданным условиям мест не найдено.", recommendations: [], usedContext: { locationLabel: "EXPO", filters: { ...payload().filters, requiredFacts: [], preferredTags: [], conflict: null }, profileId: null, isDemoProfile: false, dataSnapshot: "unit-catalog-hash" }, warnings: [] });
}
function request(body: BodyInit = JSON.stringify(payload()), headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request("http://localhost/api/recommend", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body, signal, duplex: "half" } as RequestInit & { duplex: "half" });
}
function handler(core: Core = async () => domainResponse()) {
  return createRecommendHandler({ now: () => new Date(), recommend: core, rateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) });
}
function delayedBody(chunks: { afterMs: number; text: string }[]) {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk, index) => {
        timers.push(setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(chunk.text));
          if (index === chunks.length - 1) controller.close();
        }, chunk.afterMs));
      });
    },
    cancel() { cancelled = true; timers.forEach(clearTimeout); },
  });
  return { body, wasCancelled: () => cancelled };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(serverNow);
  vi.stubEnv("APP_AI_MODE", "stub"); vi.stubEnv("OPENROUTER_PAID_ENABLED", "false"); vi.stubEnv("LIVE_EVAL_ENABLED", "false"); vi.stubEnv("APP_USE_SYNTHETIC", "false");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("real route wiring without network", () => {
  it("serves 1-3 real catalogue cards through the actual configured stub POST", async () => {
    const real = CatalogSchema.parse(JSON.parse(readFileSync("data/catalog/places.json", "utf8")));
    const response = await POST(request());
    expect(response.status).toBe(200);
    const result = RecommendResponseSchema.parse(await response.json());
    expect(result.status).toBe("degraded");
    expect(result.recommendations.length).toBeGreaterThan(0); expect(result.recommendations.length).toBeLessThanOrEqual(3);
    expect(result.recommendations.every((r) => real.places.some((p) => p.id === r.poi.id))).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/демо|ИИ|AI/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("strict POST boundary and bounded streaming input", () => {
  it("accepts the v1 request and creates clock/deadline/signal on the server", async () => {
    const core = vi.fn<Core>(async () => domainResponse());
    const response = await handler(core)(request());
    expect(response.status).toBe(200); expect(RecommendResponseSchema.parse(await response.json()).status).toBe("no_results");
    expect(core).toHaveBeenCalledOnce();
    expect(core.mock.calls[0][0]).toEqual(payload());
    expect(core.mock.calls[0][1]).toMatchObject({ now: serverNow, deadlineAt: serverNow.getTime() + 25_000, signal: expect.any(AbortSignal) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["now", "2000-01-01T00:00:00Z"], ["mode", "live"], ["purpose", "demo"],
    ["cost", 0], ["semanticScores", {}], ["dependencies", {}],
  ] as const)("rejects browser-supplied internal %s", async (key, value) => {
    const core = vi.fn<Core>();
    const response = await handler(core)(request(JSON.stringify({ ...payload(), [key]: value })));
    expect(response.status).toBe(400); expect(core).not.toHaveBeenCalled();
  });

  it.each(["{", "{\"query\":\"FAKE_PRIVATE_QUERY\"", "null", "[]"])("sanitizes malformed/invalid JSON", async (body) => {
    const core = vi.fn<Core>(); const response = await handler(core)(request(body));
    expect(response.status).toBe(400); expect(await response.text()).not.toContain("FAKE_PRIVATE_QUERY");
    expect(core).not.toHaveBeenCalled();
  });

  it("rejects non-application/json media before core/provider dispatch", async () => {
    const core = vi.fn<Core>();
    const response = await handler(core)(request(JSON.stringify(payload()), { "Content-Type": "text/plain" }));
    expect(response.status).toBe(400); expect(core).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a query longer than1000 characters before core/provider calls", async () => {
    const core = vi.fn<Core>();
    const response = await handler(core)(request(JSON.stringify({ ...payload(), query: "я".repeat(1001) })));
    expect(response.status).toBe(400); expect(core).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes rather than JavaScript string length", async () => {
    const input = payload();
    input.savedIds = Array.from({ length: 100 }, (_, index) => `2gis:${"ә".repeat(90)}${index}`);
    const body = JSON.stringify(input);
    expect(body.length).toBeLessThan(16 * 1024); expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(16 * 1024);
    const core = vi.fn<Core>(); const response = await handler(core)(request(body));
    expect(response.status).toBe(400); expect(core).not.toHaveBeenCalled();
  });

  it("stops an oversized chunked reader despite a false small Content-Length", async () => {
    let cancelled = false; let chunk = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(chunk++ < 10 ? " ".repeat(8192) : JSON.stringify(payload())));
        if (chunk > 11) controller.close();
      },
      cancel() { cancelled = true; },
    });
    const core = vi.fn<Core>(); const response = await handler(core)(request(body, { "Content-Length": "1" }));
    expect(response.status).toBe(400); expect(cancelled).toBe(true); expect(core).not.toHaveBeenCalled();
  });

  it("starts the25-second deadline before reading a slow body and cancels the reader", async () => {
    const json = JSON.stringify(payload());
    const stream = delayedBody([{ afterMs: 20_000, text: json.slice(0, 20) }, { afterMs: 30_000, text: json.slice(20) }]);
    const core = vi.fn<Core>(); const pending = handler(core)(request(stream.body));
    await vi.advanceTimersByTimeAsync(25_001);
    expect((await pending).status).toBe(503); expect(stream.wasCancelled()).toBe(true); expect(core).not.toHaveBeenCalled();
  });
});

describe("server rate limit, deadlines, cancellation and sanitized errors", () => {
  it("rate-limits before the core and returns a numeric Retry-After", async () => {
    const core = vi.fn<Core>();
    const limited = createRecommendHandler({ now: () => new Date(), recommend: core, rateLimit: () => ({ allowed: false, retryAfterSeconds: 7 }) });
    const response = await limited(request());
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("7"); expect(core).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not give core a fresh25 seconds after20 seconds of body reading", async () => {
    const stream = delayedBody([{ afterMs: 20_000, text: JSON.stringify(payload()) }]);
    const core = vi.fn<Core>(async () => domainResponse()); const pending = handler(core)(request(stream.body));
    await vi.advanceTimersByTimeAsync(20_001);
    expect((await pending).status).toBe(200);
    expect(core.mock.calls[0][1].deadlineAt).toBe(serverNow.getTime() + 25_000);
  });

  it("bounds an abort-ignoring core to the original deadline", async () => {
    let aborted = false;
    const core = vi.fn<Core>(async (_input, context) => {
      context.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      return new Promise<RecommendResponse>(() => {});
    });
    const pending = handler(core)(request()); await vi.advanceTimersByTimeAsync(25_001);
    expect((await pending).status).toBe(503); expect(aborted).toBe(true); expect(core).toHaveBeenCalledOnce();
  });

  it("does not read or dispatch a request whose signal is already aborted", async () => {
    const controller = new AbortController(); controller.abort();
    const core = vi.fn<Core>(); const response = await handler(core)(request(JSON.stringify(payload()), {}, controller.signal));
    expect(response.status).toBe(503); expect(core).not.toHaveBeenCalled();
  });

  it("cancels body reading on client abort and never dispatches late core work", async () => {
    const stream = delayedBody([{ afterMs: 30_000, text: JSON.stringify(payload()) }]);
    const controller = new AbortController(); const core = vi.fn<Core>();
    const pending = handler(core)(request(stream.body, {}, controller.signal));
    await vi.advanceTimersByTimeAsync(100); controller.abort(); await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(503); expect(stream.wasCancelled()).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000); expect(core).not.toHaveBeenCalled();
  });

  it("forwards in-flight client abort and starts no subsequent core operation", async () => {
    const controller = new AbortController(); let observed: AbortSignal | undefined;
    const core = vi.fn<Core>(async (_input, context) => { observed = context.signal; return new Promise<RecommendResponse>(() => {}); });
    const pending = handler(core)(request(JSON.stringify(payload()), {}, controller.signal));
    await vi.advanceTimersByTimeAsync(1); controller.abort(); await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(503); expect(observed?.aborted).toBe(true); expect(core).toHaveBeenCalledOnce();
  });

  it("sanitizes catalogue/provider failures and does not log queries, coordinates or secret details", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const input = payload(); input.query = "FAKE_PRIVATE_QUERY"; input.location.lat = 51.123456789;
    const core: Core = async () => { throw new Error("FAKE_PROVIDER_SECRET"); };
    const response = await handler(core)(request(JSON.stringify(input)));
    expect(response.status).toBe(503);
    const captured = `${await response.text()} ${JSON.stringify(log.mock.calls)} ${JSON.stringify(error.mock.calls)} ${JSON.stringify(warn.mock.calls)} ${JSON.stringify(info.mock.calls)}`;
    expect(captured).not.toMatch(/FAKE_PRIVATE_QUERY|FAKE_PROVIDER_SECRET|51\.123456789/);
  });
});
