import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetGuard, initializeLedger } from "../../src/lib/ai/budget";
import { verifyQuoteMetadata } from "../../src/lib/ai/metadata";
import { createChatJson, type ChatJsonRequest } from "../../src/lib/ai/openrouter";
import { quoteRequest } from "../../src/lib/ai/pricing";
import { GuardedTransport } from "../../src/lib/ai/transport";

const model = "qwen/qwen3.8-flash";
let directory: string;
let guard: BudgetGuard;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aituhack-qwen-route-"));
  const path = join(directory, "ledger.json"); await initializeLedger(path);
  guard = new BudgetGuard({ path });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NETWORK_FORBIDDEN"); }));
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });

// Public endpoint shape/rates verified2026-10-20; no claim about quota or429.
// Literal limits also ensure the fixture cannot shrink with a changed quote.
function metadata() {
  const pricing = { prompt: "0.00000015", completion: "0.00000047", input_cache_read: "0.000000016", discount: 0 };
  const supported_parameters = ["max_tokens", "response_format", "structured_outputs", "reasoning"];
  const endpoint = { model_id: model, tag: "alibaba/us-east-1", context_length: 1000000,
    max_completion_tokens: 131072, max_prompt_tokens: null as number | null,
    supported_parameters: [...supported_parameters], pricing: { ...pricing } as Record<string, unknown> };
  return { model: { id: model, context_length: 1000000, top_provider: { max_completion_tokens: 131072 },
    supported_parameters, pricing: { ...pricing, input_cache_write: "0.0000002" } },
    endpoints: { data: { id: model, endpoints: [endpoint,
      { ...structuredClone(endpoint), tag: "alibaba", pricing: { ...pricing, input_cache_write: "0.0000002" } }] } } };
}
function request(stage: "intent" | "explanation" = "intent"): ChatJsonRequest {
  return { stage, purpose: "live_eval", deadlineAt: Date.now() + 25_000,
    messages: [{ role: "user", content: "offline route fixture" }],
    jsonSchema: { name: "route_fixture", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } } };
}
function response() { return { status: 200, body: { provider: "Alibaba", model, usage: { cost: .00001 },
  choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }] } }; }

describe("deterministic Qwen US route candidate", () => {
  it.each([["intent", 400], ["explanation", 1000]] as const)("pins immutable %s route without shrinking full context/output/cache reserve", (operation, limit) => {
    const quote = quoteRequest({ operation, model, maxCompletionTokens: limit });
    expect(quote).toMatchObject({ estimatedUsd: .26160384, contextLength: 1000000, maxCompletionTokens: limit,
      outputParameter: "max_tokens", billing: { inputUsdPerToken: "0.0000002", completionUsdPerToken: "0.00000047", maxOutputTokens: 131072 },
      provider: { only: ["alibaba/us-east-1"], allow_fallbacks: false, require_parameters: true,
        max_price: { prompt: "0.15", completion: "0.47", request: "0", image: "0", audio: "0" } } });
    expect(Object.isFrozen(quote.provider.only)).toBe(true);
    expect(Reflect.set(quote.provider.only!, "0", "alibaba")).toBe(false);
    expect(quote.provider.only).toEqual(["alibaba/us-east-1"]);
    expect(quote).not.toHaveProperty("reasoning");
  });
  it.each([["intent", 400], ["explanation", 1000]] as const)("sends only verifiedUS for %s with strict original output/schema/reasoning policy", async (stage, limit) => {
    const quote = quoteRequest({ operation: stage, model, maxCompletionTokens: limit });
    verifyQuoteMetadata(quote, metadata());
    let calls = 0;
    const chat = createChatJson({ model, transport: new GuardedTransport({ guard, liveEvalEnabled: true, send: async (call, signal) => {
      calls++;
      expect(call.body).toMatchObject({ model, stream: false, max_tokens: limit,
        provider: { only: ["alibaba/us-east-1"], allow_fallbacks: false, require_parameters: true, max_price: { prompt: "0.15", completion: "0.47" } },
        response_format: { type: "json_schema", json_schema: { strict: true, schema: request().jsonSchema.schema } } });
      expect(call.body).not.toHaveProperty("max_completion_tokens"); expect(call.body).not.toHaveProperty("reasoning");
      expect(signal.aborted).toBe(false); return response();
    } }) });
    await expect(chat(request(stage))).resolves.toEqual({ ok: true });
    expect(calls).toBe(1);
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, spent: { prep: .00001, live_eval: .00001, demo: 0 } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["missingUS", "duplicateUS", "prompt", "completion", "cache", "request", "context", "output", "max_tokens", "response_format", "structured_outputs"])("rejects %s US metadata before sending despite a capable global endpoint", async (change) => {
    const input = metadata(); const endpoint = input.endpoints.data.endpoints[0];
    if (change === "missingUS") input.endpoints.data.endpoints.shift();
    if (change === "duplicateUS") input.endpoints.data.endpoints.push(structuredClone(endpoint));
    if (change === "prompt") endpoint.pricing.prompt = "0.000000151";
    if (change === "completion") endpoint.pricing.completion = "0.000000471";
    if (change === "cache") endpoint.pricing.input_cache_write = "0.000000201";
    if (change === "request") endpoint.pricing.request = "0.000001";
    if (change === "context") endpoint.context_length++;
    if (change === "output") endpoint.max_completion_tokens++;
    if (["max_tokens", "response_format", "structured_outputs"].includes(change)) endpoint.supported_parameters = endpoint.supported_parameters.filter((key) => key !== change);
    let calls = 0;
    const chat = createChatJson({ model, transport: new GuardedTransport({ guard, liveEvalEnabled: true, send: async () => { calls++; return response(); } }) });
    const execute = async () => { verifyQuoteMetadata(quoteRequest({ operation: "intent", model, maxCompletionTokens: 400 }), input); return chat(request()); };
    await expect(execute()).rejects.toThrow("MODEL_METADATA_CHANGED");
    expect(calls).toBe(0); expect(fetch).not.toHaveBeenCalled();
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, spent: { prep: 0, live_eval: 0, demo: 0 } });
  });
  it("does not admit caller/provider or forged quote overrides of the pinned region", async () => {
    const quote = quoteRequest({ operation: "intent", model, maxCompletionTokens: 400 });
    let calls = 0;
    const transport = new GuardedTransport({ guard, send: async () => { calls++; return response(); } });
    const body = { messages: [{ role: "user", content: "offline" }] };
    await expect(transport.execute({ purpose: "prep", quote: { ...quote, provider: { ...quote.provider, only: ["alibaba"] } }, body })).rejects.toThrow("INVALID_QUOTE");
    await expect(transport.execute({ purpose: "prep", quote, body: { ...body, provider: { only: ["alibaba"] } } })).rejects.toThrow("UNSUPPORTED_REQUEST");
    expect(calls).toBe(0); expect((await guard.snapshot()).spent.prep).toBe(0);
  });
});
