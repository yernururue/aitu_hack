import { afterEach, describe, expect, it, vi } from "vitest";
import { createRemoteRecommend, withRequiredRecommendToken } from "@/lib/ai/remote-recommend";
import { createRecommendHandler } from "@/lib/recommend";
import { createDefaultFilters, type RecommendRequest } from "@/lib/contracts/request";

const token = "a".repeat(64);
const env = { RECOMMEND_REMOTE_ORIGIN: "https://owned-backend.trycloudflare.com", RECOMMEND_REMOTE_TOKEN: token };
const input: RecommendRequest = { query: "Парк", locale: "ru", location: { lat: 51.09, lon: 71.418, source: "preset" }, filters: createDefaultFilters(), explicitFilterKeys: [], profileId: null, savedIds: [], dismissedIds: [] };
const answer = { status: "no_results", message: "Нет мест по условиям.", recommendations: [], usedContext: { locationLabel: "EXPO", filters: { ...input.filters, requiredFacts: [], preferredTags: [], conflict: null }, profileId: null, isDemoProfile: false, dataSnapshot: "unit-snapshot" }, warnings: [] };
const context = () => ({ now: new Date(), deadlineAt: Date.now() + 25_000, signal: new AbortController().signal });
const request = (headers: Record<string, string> = {}, body = JSON.stringify(input)) => new Request("https://public.example/api/recommend", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("guarded remote recommendation boundary", () => {
  it("forwards one parsed request and only server-owned credentials, without browser headers", async () => {
    let actualUrl = ""; let actualInit: RequestInit | undefined;
    const upstream: typeof fetch = async (url, init) => { actualUrl = String(url); actualInit = init; return Response.json(answer); };
    const core = createRemoteRecommend(env, upstream)!;
    const response = await createRecommendHandler({ recommend: core })(request({ Cookie: "browser-cookie", Authorization: "browser-secret", "x-forwarded-for": "192.0.2.1" }));
    expect(response.status).toBe(200); expect((await response.json()).status).toBe("no_results");
    expect(actualUrl).toBe("https://owned-backend.trycloudflare.com/api/recommend");
    expect(JSON.parse(actualInit!.body as string)).toEqual(input);
    expect(new Headers(actualInit!.headers).get("x-aituhack-backend-token")).toBe(token);
    expect([...new Headers(actualInit!.headers).keys()].sort()).toEqual(["content-type", "x-aituhack-backend-token"]);
    expect(actualInit).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
  });
  it.each([{}, { RECOMMEND_REMOTE_TOKEN: token }, { RECOMMEND_REMOTE_ORIGIN: env.RECOMMEND_REMOTE_ORIGIN }])("fails closed on incomplete live Vercel configuration %j", (extra) => {
    expect(() => createRemoteRecommend({ APP_AI_MODE: "live", VERCEL: "1", ...extra })).toThrow();
  });
  it.each(["http://owned-backend.trycloudflare.com", "https://localhost", "https://public.example", "https://user:pass@owned-backend.trycloudflare.com", "https://owned-backend.trycloudflare.com/path", "https://owned-backend.trycloudflare.com?query=1"]) ("rejects unsafe or recursive backend origin %s", (origin) => {
    expect(() => createRemoteRecommend({ ...env, RECOMMEND_REMOTE_ORIGIN: origin })).toThrow();
  });
  it("preserves the local core when no proxy is configured outside live Vercel", () => {
    expect(createRemoteRecommend({ APP_AI_MODE: "disabled", VERCEL: "1" })).toBeNull();
    expect(createRemoteRecommend({ APP_AI_MODE: "live" })).toBeNull();
  });
  it.each([new Response("private-upstream-error", { status: 500 }), Response.json({ secret: "invalid-contract" }), new Response("<html>tunnel</html>", { headers: { "Content-Type": "text/html" } })])("returns sanitized 503 on upstream failure or invalid contract", async (upstreamResponse) => {
    let calls = 0;
    const core = createRemoteRecommend(env, async () => { calls++; return upstreamResponse; })!;
    const response = await createRecommendHandler({ recommend: core })(request());
    expect(response.status).toBe(503); expect(calls).toBe(1); expect(await response.text()).not.toMatch(/secret|private-upstream|tunnel|invalid-contract/);
  });
  it("aborts an early non-JSON streaming response so its upstream connection cannot outlive the request", async () => {
    let upstreamSignal: AbortSignal | undefined;
    const core = createRemoteRecommend(env, async (_url, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("upstream error")); } }), { status: 502 });
    })!;
    expect((await createRecommendHandler({ recommend: core })(request())).status).toBe(503);
    expect(upstreamSignal?.aborted).toBe(true);
  });
  it("does not dispatch invalid input to the backend", async () => {
    let calls = 0;
    const core = createRemoteRecommend(env, async () => { calls++; return Response.json(answer); })!;
    expect((await createRecommendHandler({ recommend: core })(request({}, JSON.stringify({ query: "bad" })))).status).toBe(400);
    expect(calls).toBe(0);
  });
  it("aborts at the shared deadline without retrying or leaking upstream errors", async () => {
    vi.useFakeTimers(); let calls = 0; let upstreamSignal: AbortSignal | undefined;
    const core = createRemoteRecommend(env, async (_url, init) => { calls++; upstreamSignal = init?.signal as AbortSignal; return new Promise<Response>(() => {}); })!;
    const result = core(input, { ...context(), deadlineAt: Date.now() + 20 });
    const rejection = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(21); await rejection;
    expect(calls).toBe(1); expect(upstreamSignal?.aborted).toBe(true);
  });
  it.each([undefined, "b".repeat(64), "a"]) ("rejects absent/invalid backend token before calling any handler", async (provided) => {
    let called = false;
    const gated = withRequiredRecommendToken(async () => { called = true; return Response.json(answer); }, { RECOMMEND_REQUIRED_TOKEN: token });
    const response = await gated(request(provided ? { "x-aituhack-backend-token": provided } : {}));
    expect(response.status).toBe(401); expect(called).toBe(false); expect(await response.text()).not.toContain(token);
  });
  it("accepts the matching required token and preserves public operation when gate is absent", async () => {
    const handler = async () => Response.json(answer);
    expect((await withRequiredRecommendToken(handler, { RECOMMEND_REQUIRED_TOKEN: token })(request({ "x-aituhack-backend-token": token }))).status).toBe(200);
    expect((await withRequiredRecommendToken(handler, {})(request())).status).toBe(200);
  });
});
