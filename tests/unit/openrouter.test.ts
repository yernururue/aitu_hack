import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetGuard, initializeLedger } from "../../src/lib/ai/budget";
import { GuardedTransport, TransportError, type ProviderSend } from "../../src/lib/ai/transport";
import { createChatJson, type ChatAttemptEvent, type ChatJsonRequest } from "../../src/lib/ai/openrouter";
import { z } from "zod";
import { IntentSchema, createDefaultFilters } from "../../src/lib/contracts/request";
import { ExplanationSchema, validateExplanation } from "../../src/lib/ai/validate";

let directory: string;
let guard: BudgetGuard;
let ledgerPath: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aituhack-chat-"));
  ledgerPath = join(directory, "ledger.json");
  await initializeLedger(ledgerPath);
  guard = new BudgetGuard({ path: ledgerPath });
});
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });
const request = (overrides: Partial<ChatJsonRequest> = {}): ChatJsonRequest => ({
  stage: "intent", messages: [{ role: "user", content: "private text" }],
  jsonSchema: { name: "intent_v1", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } },
  deadlineAt: Date.now() + 25_000, ...overrides,
});
function response(content = '{"ok":true}', cost = 0.001, finishReason = "stop") {
  return { status: 200, body: { model: "openai/gpt-6-luna", provider: "OpenAI", usage: { cost, prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }, choices: [{ finish_reason: finishReason, message: { role: "assistant", content } }] } };
}
function client(send: ProviderSend, onAttempt?: (event: ChatAttemptEvent) => void | Promise<void>) {
  return createChatJson({ model: "openai/gpt-6-luna", transport: new GuardedTransport({ guard, send }), onAttempt });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("structured server chat", () => {
  it.each([["intent", IntentSchema], ["explanation", ExplanationSchema]] as const)("projects actual core %s schema bounds only for Haiku without mutating the original", async (stage, coreSchema) => {
    const schema = z.toJSONSchema(coreSchema);
    const before = structuredClone(schema);
    const events: ChatAttemptEvent[] = [];
    const unsupported: string[] = [];
    let descriptions = 0;
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems"].includes(key) || key === "minItems" && child !== 0 && child !== 1) unsupported.push(key);
        if (key === "description" && typeof child === "string" && child.includes("Locally validated constraints:")) descriptions++;
        walk(child);
      }
    };
    let wire: { schema: unknown; strict: boolean } | undefined;
    const send: ProviderSend = async (call) => { wire = (call.body.response_format as { json_schema: typeof wire }).json_schema; return response(); };
    const chat = createChatJson({ model: "anthropic/claude-haiku-5.5", transport: new GuardedTransport({ guard, send }), onAttempt: (event) => { events.push(event); } });
    await expect(chat(request({ stage, jsonSchema: { name: "actual_core", schema } }))).resolves.toEqual({ ok: true });
    expect(wire?.strict).toBe(true);
    walk(wire?.schema);
    expect(unsupported).toEqual([]);
    expect(descriptions).toBeGreaterThan(0);
    expect(wire?.schema).toMatchObject({ type: "object", additionalProperties: false, required: before.required });
    expect(schema).toEqual(before);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ schemaProjectionVersion: "anthropic-bounds-v1", costKnown: true });
  });
  it("preserves schema-keyword property names, enum/required/closed shape, allowed minItems and nested descriptions", async () => {
    const schema = { type: "object", properties: {
      maxLength: { type: "string", maxLength: 5, description: "Original description" },
      maximum: { type: "number", minimum: 0, maximum: 10, multipleOf: 2 },
      items: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: ["park", "cafe"], minLength: 1 } },
      properties: { type: "object", properties: { minimum: { anyOf: [{ type: "string", maxLength: 3 }, { type: "null" }] } }, required: ["minimum"], additionalProperties: false },
    }, required: ["maxLength", "maximum", "items", "properties"], additionalProperties: false };
    const before = structuredClone(schema);
    let wire: typeof schema | undefined;
    const send: ProviderSend = async (call) => { wire = (call.body.response_format as { json_schema: { schema: typeof schema } }).json_schema.schema; return response(); };
    await expect(createChatJson({ model: "anthropic/claude-haiku-5.5", transport: new GuardedTransport({ guard, send }) })(request({ jsonSchema: { name: "keyword_names", schema } }))).resolves.toEqual({ ok: true });
    expect(Object.keys(wire!.properties)).toEqual(Object.keys(schema.properties));
    expect(wire!.required).toEqual(schema.required);
    expect(wire!.properties.maxLength).toEqual({ type: "string", description: 'Original description\nLocally validated constraints: {"maxLength":5}' });
    expect(wire!.properties.maximum).toEqual({ type: "number", description: 'Locally validated constraints: {"minimum":0,"maximum":10,"multipleOf":2}' });
    expect(wire!.properties.items).toMatchObject({ type: "array", minItems: 1, items: { enum: ["park", "cafe"] } });
    expect(wire!.properties.items).not.toHaveProperty("maxItems");
    expect(wire!.properties.properties.properties.minimum.anyOf[0]).not.toHaveProperty("maxLength");
    expect(schema).toEqual(before);
  });
  it.each(["openai/gpt-6-luna", "qwen/qwen3.8-flash"])("keeps the exact original wire schema for %s", async (model) => {
    const schema = z.toJSONSchema(IntentSchema);
    const send: ProviderSend = async (call) => { expect(call.body.response_format).toMatchObject({ json_schema: { schema } }); return response(); };
    const events: ChatAttemptEvent[] = [];
    await createChatJson({ model, transport: new GuardedTransport({ guard, send }), onAttempt: (event) => { events.push(event); } })(request({ jsonSchema: { name: "identity", schema } }));
    expect(events[0]).toMatchObject({ schemaProjectionVersion: "identity-v1", reasoningPolicy: "provider-default" });
  });
  it.each([0, 1, 2])("retains only supported array minItems=%s on Haiku's wire", async (minItems) => {
    const schema = { type: "object", properties: { values: { type: "array", items: { type: "string" }, minItems } }, required: ["values"], additionalProperties: false };
    let wire: typeof schema | undefined;
    const send: ProviderSend = async (call) => { wire = (call.body.response_format as { json_schema: { schema: typeof schema } }).json_schema.schema; return response(); };
    await createChatJson({ model: "anthropic/claude-haiku-5.5", transport: new GuardedTransport({ guard, send }) })(request({ jsonSchema: { name: "array_bounds", schema } }));
    if (minItems < 2) expect(wire!.properties.values.minItems).toBe(minItems);
    else { expect(wire!.properties.values).not.toHaveProperty("minItems"); expect(wire!.properties.values).toHaveProperty("description", 'Locally validated constraints: {"minItems":2}'); }
    expect(schema.properties.values.minItems).toBe(minItems);
  });
  it("still rejects out-of-bounds generated values through the unchanged core validators after wire projection", async () => {
    const badIntent = { ...createDefaultFilters(), maxSpendKzt: -1, requiredFacts: [], preferredTags: [], conflict: null };
    const badExplanation = { items: [{ poiId: "test-place", why: "a".repeat(10_001), activity: "Walk", evidenceIds: ["test-source"] }] };
    for (const [stage, schema, raw] of [["intent", IntentSchema, badIntent], ["explanation", ExplanationSchema, badExplanation]] as const) {
      const chat = createChatJson({ model: "anthropic/claude-haiku-5.5", transport: new GuardedTransport({ guard, send: async () => response(JSON.stringify(raw)) }) });
      const parsed = await chat(request({ stage, jsonSchema: { name: "core_bounds", schema: z.toJSONSchema(schema) } }));
      expect(schema.safeParse(parsed).success).toBe(false);
      if (stage === "explanation") expect(() => validateExplanation(parsed, [])).toThrow(z.ZodError);
    }
    expect((await guard.snapshot()).spent.prep).toBe(0.002);
  });
  it.each([["intent", 400], ["explanation", 1000]] as const)("uses the issued fixed Haiku route and original %s output/deadline controls", async (stage, limit) => {
    const send: ProviderSend = async (call) => {
      expect(call.body).toMatchObject({ model: "anthropic/claude-haiku-5.5", max_completion_tokens: limit, stream: false, provider: { only: ["azure/global"], allow_fallbacks: false, require_parameters: true, max_price: { prompt: "0.1", completion: "0.5" } } });
      const result = response();
      return { ...result, body: { ...result.body, model: "anthropic/claude-haiku-5.5", provider: "Azure" } };
    };
    const chat = createChatJson({ model: "anthropic/claude-haiku-5.5", transport: new GuardedTransport({ guard, send, liveEvalEnabled: true }) });
    await expect(chat(request({ stage, purpose: "live_eval" }))).resolves.toEqual({ ok: true });
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, caps: { prep: 2, live_eval: 0.5, demo: 4 }, spent: { prep: 0.001, live_eval: 0.001, demo: 0 } });
  });
  it.each([["intent", 400], ["explanation", 1000]] as const)("explicitly disables Haiku adaptive thinking for the %s visible-output budget", async (stage, limit) => {
    let body: Record<string, unknown> | undefined;
    const events: ChatAttemptEvent[] = [];
    const chat = createChatJson({ model: "anthropic/claude-haiku-5.5", transport: new GuardedTransport({ guard, send: async (call) => { body = call.body; return response(); } }), onAttempt: (event) => { events.push(event); } });
    await expect(chat(request({ stage }))).resolves.toEqual({ ok: true });
    expect(body).toMatchObject({ max_completion_tokens: limit, reasoning: { enabled: false } });
    expect(body!.reasoning).toEqual({ enabled: false });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reasoningPolicy: "disabled", schemaProjectionVersion: "anthropic-bounds-v1", costKnown: true });
  });
  it.each(["openai/gpt-6-luna", "qwen/qwen3.8-flash"])("leaves %s reasoning policy unchanged", async (model) => {
    let body: Record<string, unknown> | undefined;
    await createChatJson({ model, transport: new GuardedTransport({ guard, send: async (call) => { body = call.body; return response(); } }) })(request());
    expect(body).not.toHaveProperty("reasoning");
  });
  it.each([["intent", 400], ["explanation", 1000]] as const)("sends strict schema and fixed %s output budget", async (stage, limit) => {
    const chat = client(async (call) => {
      expect(call.body).toMatchObject({ stream: false, max_completion_tokens: limit, provider: { require_parameters: true, allow_fallbacks: false }, response_format: { type: "json_schema", json_schema: { name: "intent_v1", strict: true, schema: { additionalProperties: false } } } });
      return response();
    });
    expect(await chat(request({ stage }))).toEqual({ ok: true });
    expect((await guard.snapshot()).spent.prep).toBe(0.001);
  });
  it("uses two separately charged attempts for known-cost malformed JSON", async () => {
    let calls = 0;
    const events: ChatAttemptEvent[] = [];
    const chat = client(async () => response(++calls === 1 ? "{truncated" : '{"ok":true}'), (event) => { events.push(event); });
    expect(await chat(request())).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect((await guard.snapshot()).spent.prep).toBe(0.002);
    const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
    expect(ledger.entries).toHaveLength(2);
    expect(events.map((event) => event.outcome)).toEqual(["invalid_response", "ok"]);
    expect(events[0]).toMatchObject({ stage: "intent", attempt: 1, model: "openai/gpt-6-luna", provider: "OpenAI", costUsd: 0.001, costKnown: true, usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 } });
    expect(JSON.stringify(events)).not.toContain("private text");
  });
  it.each(["```json\n{\"ok\":true}\n```", '{"ok":', "[]", "null"])("never salvages malformed or non-object JSON %s beyond one retry", async (content) => {
    let calls = 0;
    const chat = client(async () => { calls++; return response(content); });
    await expect(chat(request())).rejects.toMatchObject({ code: "INVALID_UPSTREAM_RESPONSE", costKnown: true, dispatched: true });
    expect(calls).toBe(2);
    expect((await guard.snapshot()).spent.prep).toBe(0.002);
  });
  it("does not retry an explicit model refusal", async () => {
    let calls = 0;
    const chat = client(async () => { calls++; const result = response(); return { ...result, body: { ...result.body, choices: [{ finish_reason: "stop", message: { content: "", refusal: "private provider refusal" } }] } }; });
    const error = await chat(request()).catch((error) => error);
    expect(error).toMatchObject({ code: "UPSTREAM_REJECTED" });
    expect(String(error)).not.toContain("private provider refusal");
    expect(calls).toBe(1);
  });
  it("does not claim generic schema/grounding validation of parsed unknown", async () => {
    const chat = client(async () => response('{"unexpected":"core must reject this"}'));
    expect(await chat(request())).toEqual({ unexpected: "core must reject this" });
  });
  it("accepts strict schemas with field names that also name schema keywords", async () => {
    const chat = client(async () => response('{"properties":"value"}'));
    await expect(chat(request({ jsonSchema: { name: "keyword_field", schema: { type: "object", properties: { properties: { type: "string" } }, required: ["properties"], additionalProperties: false } } }))).resolves.toEqual({ properties: "value" });
  });
  it.each(["$dynamicRef", "$recursiveRef"].flatMap((keyword) => ["https://example.invalid/schema", "#/$defs/local"].flatMap((target) => ["root", "items"].map((position) => ({ keyword, target, position })))))("rejects unsupported $keyword at $position before dispatch ($target)", async ({ keyword, target, position }) => {
    const send = vi.fn(async () => response());
    const schema = position === "root"
      ? { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false, [keyword]: target }
      : { type: "object", properties: { ok: { type: "array", items: { [keyword]: target } } }, required: ["ok"], additionalProperties: false };
    await expect(client(send)(request({ jsonSchema: { name: "unsupported_ref", schema } }))).rejects.toMatchObject({ code: "INVALID_REQUEST", dispatched: false });
    expect(send).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(ledgerPath, "utf8")).entries).toEqual([]);
  });
  it("allows dynamic-reference keyword names as ordinary data properties", async () => {
    const chat = client(async () => response('{"$dynamicRef":"data","$recursiveRef":"data"}'));
    await expect(chat(request({ jsonSchema: { name: "reference_named_fields", schema: { type: "object", properties: { $dynamicRef: { type: "string" }, $recursiveRef: { type: "string" } }, required: ["$dynamicRef", "$recursiveRef"], additionalProperties: false } } }))).resolves.toEqual({ $dynamicRef: "data", $recursiveRef: "data" });
  });
  it.each([429, 502, 503, 504])("retries a known settled HTTP%s once", async (status) => {
    let calls = 0;
    const chat = client(async () => { const result = response(); return { ...result, status: ++calls === 1 ? status : 200 }; });
    expect(await chat(request())).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect((await guard.snapshot()).spent.prep).toBe(0.002);
  });
  it.each([400, 401, 403])("does not retry HTTP%s despite known cost", async (status) => {
    let calls = 0;
    const chat = client(async () => { calls++; return { ...response(), status }; });
    await expect(chat(request())).rejects.toMatchObject({ code: "UPSTREAM_REJECTED", costKnown: true });
    expect(calls).toBe(1);
  });
  it.each(["network", "missing-cost-429"])("freezes unknown %s without any retry", async (failure) => {
    let calls = 0;
    const chat = client(async () => { calls++; if (failure === "network") throw new Error("PRIVATE_KEY_DETAIL"); return { status: 429, body: {} }; });
    const error = await chat(request()).catch((error) => error);
    expect(error).toMatchObject({ costKnown: false, dispatched: true });
    expect(String(error)).not.toContain("PRIVATE_KEY_DETAIL");
    expect(calls).toBe(1);
    expect((await guard.snapshot()).uncertain).toBe(true);
  });
  it("does not trust a generic error claiming known cost to authorize retry", async () => {
    let calls = 0;
    const chat = createChatJson({ transport: { execute: async () => { calls++; throw Object.assign(new Error("PRIVATE"), { costKnown: true, status: 429 }); } } });
    await expect(chat(request())).rejects.toMatchObject({ costKnown: false });
    expect(calls).toBe(1);
  });
  it("keeps the original messages/schema immutable across the retry", async () => {
    const first = deferred<void>(); const finish = deferred<ReturnType<typeof response>>();
    let calls = 0;
    const chat = client(async (call) => {
      calls++;
      expect(call.body.messages).toEqual([{ role: "user", content: "private text" }]);
      expect(call.body.response_format).toMatchObject({ json_schema: { schema: { required: ["ok"] } } });
      if (calls === 1) { first.resolve(); return finish.promise; }
      return response();
    });
    const original = request();
    const pending = chat(original);
    await first.promise;
    (original.messages as { role: "user"; content: string }[])[0].content = "MUTATED";
    (original.jsonSchema.schema.required as string[]).push("MUTATED");
    finish.resolve(response("invalid"));
    await expect(pending).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });
  it.each([
    { stage: "other" }, { deadlineAt: Infinity },
    { jsonSchema: { name: "bad", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: [], additionalProperties: true } } },
    { messages: [{ role: "user", content: [{ type: "image_url" }] }] },
  ])("rejects invalid request configuration before any reservation", async (bad) => {
    const send = vi.fn(async () => response());
    await expect(client(send)(request(bad as Partial<ChatJsonRequest>))).rejects.toMatchObject({ code: "INVALID_REQUEST", dispatched: false });
    expect(send).not.toHaveBeenCalled();
    expect((await guard.snapshot()).inFlight).toBe(0);
  });
  it("keeps default disabled mode lazy and performs zero ledger/network work", async () => {
    vi.stubEnv("OPENROUTER_PAID_ENABLED", "false");
    const network = vi.fn(() => { throw new Error("network forbidden"); });
    vi.stubGlobal("fetch", network);
    const chat = createChatJson();
    await expect(chat(request())).rejects.toMatchObject({ code: "PAID_CALLS_DISABLED", dispatched: false });
    expect(network).not.toHaveBeenCalled();
  });
  it("does not let metrics failure trigger retries or lose settled charges", async () => {
    let calls = 0;
    const chat = client(async () => { calls++; return response(); }, async () => { throw new Error("metrics broken"); });
    await expect(chat(request())).resolves.toEqual({ ok: true });
    expect(calls).toBe(1);
    expect((await guard.snapshot()).spent.prep).toBe(0.001);
  });
  it("does not emit a settled metric or retry when durable settlement fails", async () => {
    let calls = 0; const events: ChatAttemptEvent[] = [];
    vi.spyOn(guard, "settle").mockRejectedValueOnce(new Error("PRIVATE_DISK_PATH"));
    const chat = client(async () => { calls++; return response(); }, (event) => { events.push(event); });
    const error = await chat(request()).catch((error) => error);
    expect(error).toMatchObject({ code: "BUDGET_BLOCKED", costKnown: false, dispatched: true });
    expect(String(error)).not.toContain("PRIVATE_DISK_PATH");
    expect(calls).toBe(1); expect(events).toEqual([]);
  });
  it("allows an unresponsive metrics sink without delaying the result", async () => {
    const chat = client(async () => response(), () => new Promise(() => {}));
    await expect(chat(request())).resolves.toEqual({ ok: true });
    expect((await guard.snapshot()).spent.prep).toBe(0.001);
  });
});

describe("attempt and request cancellation", () => {
  it.each(["aborted", "expired"])("never reserves or dispatches an already %s request", async (condition) => {
    const controller = new AbortController(); if (condition === "aborted") controller.abort();
    const send = vi.fn(async () => response());
    await expect(client(send)(request({ signal: controller.signal, deadlineAt: Date.now() + (condition === "expired" ? -1 : 25000) }))).rejects.toMatchObject({ code: condition === "aborted" ? "REQUEST_ABORTED" : "DEADLINE_EXCEEDED", dispatched: false });
    expect(send).not.toHaveBeenCalled();
    expect((await guard.snapshot()).inFlight).toBe(0);
    expect(JSON.parse(await readFile(ledgerPath, "utf8")).entries).toEqual([]);
  });
  it.each(["reserve", "markDispatched"] as const)("cleans up abort during %s without a later provider send", async (method) => {
    const controller = new AbortController();
    const original = guard[method].bind(guard);
    if (method === "reserve") vi.spyOn(guard, method).mockImplementation(async (...args) => { const result = await (original as BudgetGuard["reserve"])(...args); controller.abort(); return result; });
    else vi.spyOn(guard, method).mockImplementation(async (...args) => { await (original as BudgetGuard["markDispatched"])(...args); controller.abort(); });
    const send = vi.fn(async () => response());
    await expect(client(send)(request({ signal: controller.signal }))).rejects.toMatchObject({ code: "REQUEST_ABORTED", dispatched: false });
    expect(send).not.toHaveBeenCalled();
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, spent: { prep: 0 } });
  });
  it("propagates post-send abort, freezes accounting and never retries", async () => {
    const started = deferred<AbortSignal>(); const controller = new AbortController(); let calls = 0;
    const pending = client(async (_call, signal) => { calls++; started.resolve(signal); return new Promise(() => {}); })(request({ signal: controller.signal })).catch((error) => error);
    const providerSignal = await started.promise; controller.abort();
    expect(await pending).toMatchObject({ code: "REQUEST_ABORTED", costKnown: false, dispatched: true });
    expect(providerSignal.aborted).toBe(true);
    expect(calls).toBe(1);
    expect((await guard.snapshot()).uncertain).toBe(true);
  });
  it("never dispatches later after cancellation while a reservation is pending", async () => {
    const controller = new AbortController(); const reserved = deferred<void>(); const resume = deferred<void>();
    const original = guard.reserve.bind(guard);
    vi.spyOn(guard, "reserve").mockImplementation(async (args) => { const result = await original(args); reserved.resolve(); await resume.promise; return result; });
    const send = vi.fn(async () => response());
    const pending = client(send)(request({ signal: controller.signal })).catch((error) => error);
    await reserved.promise; controller.abort();
    expect(send).not.toHaveBeenCalled();
    resume.resolve();
    expect(await pending).toMatchObject({ code: "REQUEST_ABORTED", dispatched: false });
    expect(send).not.toHaveBeenCalled();
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0 });
  });
  it("never dispatches when a slow durable transition exhausts the deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const original = guard.markDispatched.bind(guard);
    vi.spyOn(guard, "markDispatched").mockImplementation(async (reservation) => { await original(reservation); vi.setSystemTime(Date.now() + 26000); });
    const send = vi.fn(async () => response());
    await expect(client(send)(request())).rejects.toMatchObject({ code: "DEADLINE_EXCEEDED", dispatched: false });
    expect(send).not.toHaveBeenCalled();
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, spent: { prep: 0 } });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("enforces 15 seconds per attempt even if send ignores its signal", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const started = deferred<AbortSignal>(); let calls = 0;
    const pending = client(async (_call, signal) => { calls++; started.resolve(signal); return new Promise(() => {}); })(request()).catch((error) => error);
    const signal = await started.promise;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toMatchObject({ code: "UPSTREAM_TIMEOUT", costKnown: false });
    expect(signal.aborted).toBe(true); expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shares the original 25-second deadline across intent and explanation", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const started = deferred<void>(); const secondStarted = deferred<void>(); let calls = 0;
    const chat = client(async () => { calls++; if (calls === 1) { started.resolve(); return new Promise((resolve) => setTimeout(() => resolve(response()), 10000)); } secondStarted.resolve(); return new Promise(() => {}); });
    const deadlineAt = Date.now() + 25000;
    const first = chat(request({ deadlineAt })); await started.promise;
    await vi.advanceTimersByTimeAsync(10000); await first;
    const second = chat(request({ stage: "explanation", deadlineAt })).catch((error) => error);
    await secondStarted.promise;
    await vi.advanceTimersByTimeAsync(15000);
    expect(await second).toMatchObject({ code: "DEADLINE_EXCEEDED", costKnown: false });
    expect(calls).toBe(2); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not restart the shared deadline for a separately charged retry", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const firstStarted = deferred<void>(); const firstSettled = deferred<void>(); const secondStarted = deferred<void>(); let calls = 0;
    const chat = client(async () => {
      calls++;
      if (calls === 1) { firstStarted.resolve(); return new Promise((resolve) => setTimeout(() => resolve(response("invalid")), 14000)); }
      secondStarted.resolve(); return new Promise(() => {});
    }, () => { firstSettled.resolve(); });
    const pending = chat(request()).catch((error) => error);
    await firstStarted.promise;
    await vi.advanceTimersByTimeAsync(14000); await firstSettled.promise;
    await vi.advanceTimersByTimeAsync(100); await secondStarted.promise;
    await vi.advanceTimersByTimeAsync(10900);
    expect(await pending).toMatchObject({ code: "DEADLINE_EXCEEDED", costKnown: false });
    expect(calls).toBe(2);
    expect((await guard.snapshot()).spent.prep).toBe(0.001);
    expect((await guard.snapshot()).uncertain).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("honors cancellation after known-cost response without retrying", async () => {
    const controller = new AbortController(); let calls = 0;
    const chat = client(async () => { calls++; return response("invalid"); }, () => { controller.abort(); });
    await expect(chat(request({ signal: controller.signal }))).rejects.toMatchObject({ code: "REQUEST_ABORTED", costKnown: true, dispatched: true });
    expect(calls).toBe(1);
    expect((await guard.snapshot()).spent.prep).toBe(0.001);
  });
  it("reports precise settled HTTP metadata without changing legacy messages", async () => {
    const transport = new GuardedTransport({ guard, send: async () => ({ ...response(), status: 429 }) });
    const { quoteRequest } = await import("../../src/lib/ai/pricing");
    const error = await transport.execute({ purpose: "prep", quote: quoteRequest({ operation: "intent", model: "openai/gpt-6-luna", maxCompletionTokens: 400 }), body: { messages: [{ role: "user", content: "x" }] } }).catch((error) => error);
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ code: "UPSTREAM_REJECTED", message: "UPSTREAM_REJECTED", status: 429, costKnown: true, dispatched: true, durablyRecorded: true });
  });
});
