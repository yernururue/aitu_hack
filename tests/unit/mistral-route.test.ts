import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { BudgetGuard, initializeLedger } from "../../src/lib/ai/budget";
import { verifyQuoteMetadata } from "../../src/lib/ai/metadata";
import { createChatJson, type ChatAttemptEvent, type ChatJsonRequest } from "../../src/lib/ai/openrouter";
import { quoteRequest } from "../../src/lib/ai/pricing";
import { GuardedTransport } from "../../src/lib/ai/transport";
import { ExplanationSchema } from "../../src/lib/ai/validate";
import { IntentSchema } from "../../src/lib/contracts/request";

const model = "mistralai/mistral-small-3.2-24b-instruct";
let directory: string;
let path: string;
let guard: BudgetGuard;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aituhack-mistral-route-"));
  path = join(directory, "ledger.json"); await initializeLedger(path);
  guard = new BudgetGuard({ path });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NETWORK_FORBIDDEN"); }));
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });

// Literal public2026-10-20 model/selected endpoint fields; model bounds/rates
// deliberately exceed the selected endpoint. No live availability/quality claim.
function metadata() {
  const supported_parameters = ["max_tokens", "response_format", "structured_outputs"];
  const endpoint = { model_id: model, tag: "deepinfra/fp8", context_length: 128000,
    max_completion_tokens: 16384, max_prompt_tokens: null as number | null,
    supports_implicit_caching: false, supported_parameters: [...supported_parameters],
    pricing: { prompt: "0.000000075", completion: "0.0000002", discount: 0 } as Record<string, unknown> };
  return { model: { id: model, context_length: 256000, top_provider: { max_completion_tokens: 16384 },
    supported_parameters: [...supported_parameters], pricing: { prompt: "0.00000009375", completion: "0.00000025" } },
    endpoints: { data: { id: model, endpoints: [endpoint, { ...structuredClone(endpoint), tag: "unselected/provider" }] } } };
}
function request(stage: "intent" | "explanation" = "intent"): ChatJsonRequest {
  return { stage, purpose: "live_eval", deadlineAt: Date.now() + 25_000,
    messages: [{ role: "user", content: "offline route fixture" }],
    jsonSchema: { name: stage, schema: z.toJSONSchema(stage === "intent" ? IntentSchema : ExplanationSchema) } };
}
function response(cost = .00001, stage: "intent" | "explanation" = "intent") {
  const value = stage === "intent" ? { categories: [], radiusM: 2000, durationMinutes: 60, company: "solo", maxSpendKzt: null,
    openNow: false, requiredFacts: [], preferredTags: [], conflict: null } : { items: [] };
  return { status: 200, body: { provider: "DeepInfra", model, usage: { cost },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] } };
}

describe("offline Mistral DeepInfra route candidate", () => {
  it.each([["intent", 400], ["explanation", 1000]] as const)("reserves the full model envelope for %s and freezes its exact route/rates", (operation, limit) => {
    const quote = quoteRequest({ operation, model, maxCompletionTokens: limit });
    // Independently:256000*.00000009375=.024;16384*.00000025=.004096.
    expect(quote).toMatchObject({ estimatedUsd: .028096, contextLength: 256000, maxCompletionTokens: limit,
      outputParameter: "max_tokens", billing: { inputUsdPerToken: "0.00000009375", completionUsdPerToken: "0.00000025", maxOutputTokens: 16384 },
      provider: { only: ["deepinfra/fp8"], allow_fallbacks: false, require_parameters: true,
        max_price: { prompt: "0.09375", completion: "0.25", request: "0", image: "0", audio: "0" } } });
    for (const value of [quote, quote.billing, quote.provider, quote.provider.max_price, quote.provider.only]) expect(Object.isFrozen(value)).toBe(true);
    expect(Reflect.set(quote.provider.only!, "0", "unselected/provider")).toBe(false);
    expect(Reflect.set(quote.billing, "inputUsdPerToken", "0")).toBe(false);
    expect(quote.provider.only).toEqual(["deepinfra/fp8"]);
  });
  it.each([["intent", 400], ["explanation", 1000]] as const)("sends %s with original strict core schema and server-owned controls", async (stage, limit) => {
    verifyQuoteMetadata(quoteRequest({ operation: stage, model, maxCompletionTokens: limit }), metadata());
    const input = request(stage); const original = structuredClone(input.jsonSchema.schema);
    let calls = 0; const events: ChatAttemptEvent[] = [];
    const chat = createChatJson({ model, onAttempt: (event) => { events.push(event); }, transport: new GuardedTransport({ guard, liveEvalEnabled: true, send: async (call, signal) => {
      calls++;
      expect(call.endpoint).toBe("chat/completions");
      expect(call.body).toMatchObject({ model, stream: false, max_tokens: limit,
        provider: { only: ["deepinfra/fp8"], allow_fallbacks: false, require_parameters: true,
          max_price: { prompt: "0.09375", completion: "0.25", request: "0", image: "0", audio: "0" } },
        response_format: { type: "json_schema", json_schema: { name: stage, strict: true, schema: original } } });
      for (const key of ["max_completion_tokens", "reasoning", "tools", "plugins", "cache_control"]) expect(call.body).not.toHaveProperty(key);
      expect(signal.aborted).toBe(false); return response(.00001, stage);
    } }) });
    const result = await chat(input);
    expect(() => (stage === "intent" ? IntentSchema : ExplanationSchema).parse(result)).not.toThrow();
    expect(input.jsonSchema.schema).toEqual(original);
    expect(calls).toBe(1); expect(events).toMatchObject([{ costKnown: true, costUsd: .00001, schemaProjectionVersion: "identity-v1", reasoningPolicy: "provider-default" }]);
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, actualKnownSpent: { prep: .00001, live_eval: .00001, demo: 0 } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["missing", "duplicate", "modelId", "prompt", "completion", "cache", "request", "unknownFee", "context", "output", "max_tokens", "response_format", "structured_outputs"])("refuses %s selected-route drift before any dispatch", async (change) => {
    const input = metadata(); const endpoint = input.endpoints.data.endpoints[0];
    if (change === "missing") input.endpoints.data.endpoints.shift();
    if (change === "duplicate") input.endpoints.data.endpoints.push(structuredClone(endpoint));
    if (change === "modelId") endpoint.model_id = "untrusted/model";
    if (change === "prompt") endpoint.pricing.prompt = "0.000000093750001";
    if (change === "completion") endpoint.pricing.completion = "0.000000250000001";
    if (change === "cache") endpoint.pricing.input_cache_write = "0.000000093750001";
    if (change === "request") endpoint.pricing.request = "0.000000001";
    if (change === "unknownFee") endpoint.pricing.unrecognized_fee = "0.01";
    if (change === "context") endpoint.context_length = 256001;
    if (change === "output") endpoint.max_completion_tokens = 16385;
    if (["max_tokens", "response_format", "structured_outputs"].includes(change)) endpoint.supported_parameters = endpoint.supported_parameters.filter((key) => key !== change);
    let calls = 0;
    const chat = createChatJson({ model, transport: new GuardedTransport({ guard, liveEvalEnabled: true, send: async () => { calls++; return response(); } }) });
    const execute = async () => { verifyQuoteMetadata(quoteRequest({ operation: "intent", model, maxCompletionTokens: 400 }), input); return chat(request()); };
    await expect(execute()).rejects.toThrow("MODEL_METADATA_CHANGED");
    expect(calls).toBe(0); expect(fetch).not.toHaveBeenCalled();
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, spent: { prep: 0, live_eval: 0, demo: 0 } });
  });
  it("rejects untrusted route/rate/output overrides before reserving", async () => {
    const quote = quoteRequest({ operation: "intent", model, maxCompletionTokens: 400 });
    let calls = 0; const transport = new GuardedTransport({ guard, send: async () => { calls++; return response(); } });
    const body = { messages: [{ role: "user", content: "offline" }] };
    await expect(transport.execute({ purpose: "prep", quote: { ...quote, provider: { ...quote.provider, only: ["unselected/provider"] } }, body })).rejects.toThrow("INVALID_QUOTE");
    for (const override of [{ provider: { only: ["unselected/provider"] } }, { model: "untrusted/model" }, { max_tokens: 1 }, { reasoning: { enabled: true } }, { tools: [] }]) {
      await expect(transport.execute({ purpose: "prep", quote, body: { ...body, ...override } })).rejects.toThrow("UNSUPPORTED_REQUEST");
    }
    expect(calls).toBe(0); expect((await guard.snapshot()).reserved.prep).toBe(0);
  });
  it("blocks a reserve one nano below the full quote without dispatching", async () => {
    guard = new BudgetGuard({ path, caps: { prep: .028095999, live_eval: .028095999, demo: 4 } });
    let calls = 0;
    const chat = createChatJson({ model, transport: new GuardedTransport({ guard, liveEvalEnabled: true, send: async () => { calls++; return response(); } }) });
    await expect(chat(request())).rejects.toMatchObject({ code: "BUDGET_BLOCKED", dispatched: false });
    expect(calls).toBe(0); expect((await guard.snapshot()).spent.prep).toBe(0);
  });
  it("can reserve and settle exactly the full .028096 bound", async () => {
    guard = new BudgetGuard({ path, caps: { prep: .028096, live_eval: .028096, demo: 4 } });
    const chat = createChatJson({ model, transport: new GuardedTransport({ guard, liveEvalEnabled: true, send: async () => response(.028096) }) });
    await expect(chat(request())).resolves.toHaveProperty("conflict", null);
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, spent: { prep: .028096, live_eval: .028096, demo: 0 }, available: { prep: 0, live_eval: 0, demo: 4 } });
  });
  it.each([200, 429])("retains unknown STOP after HTTP%s missing cost without retry or another reservation", async (status) => {
    let calls = 0; const events: ChatAttemptEvent[] = [];
    const chat = createChatJson({ model, onAttempt: (event) => { events.push(event); }, transport: new GuardedTransport({ guard, liveEvalEnabled: true, send: async () => { calls++; return { status, body: { model, choices: [] } }; } }) });
    await expect(chat(request())).rejects.toMatchObject({ code: "COST_UNKNOWN", costKnown: false, dispatched: true });
    expect(calls).toBe(1); expect(events).toMatchObject([{ status, transportReason: "unknown_cost", costKnown: false, costUsd: null }]);
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, inFlight: 0, spent: { prep: 0, live_eval: 0, demo: 0 }, reserved: { prep: .028096, live_eval: .028096, demo: 0 } });
    await expect(chat(request("explanation"))).rejects.toMatchObject({ code: "BUDGET_BLOCKED", dispatched: false });
    expect(calls).toBe(1); expect(fetch).not.toHaveBeenCalled();
  });
});
