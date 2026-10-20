import { z } from "zod";
import { quoteRequest } from "./pricing";
import { createLiveTransport, responseAccounting, TransportError, type Accounting, type GuardedTransport } from "./transport";
import type { Purpose } from "./config";

export type ChatMessage = Readonly<{ role: "system" | "user" | "assistant"; content: string }>;
export type ChatJsonRequest = Readonly<{
  stage: "intent" | "explanation"; messages: readonly ChatMessage[];
  jsonSchema: Readonly<{ name: string; schema: Record<string, unknown> }>;
  deadlineAt: number; signal?: AbortSignal; purpose?: Purpose;
}>;
export type ChatJson = (request: ChatJsonRequest) => Promise<unknown>;
export type SchemaProjectionVersion = "identity-v1" | "anthropic-bounds-v1";
export type ChatJsonErrorCode = "PAID_CALLS_DISABLED" | "INVALID_REQUEST" | "REQUEST_ABORTED" | "DEADLINE_EXCEEDED" | "UPSTREAM_TIMEOUT" | "UPSTREAM_RATE_LIMITED" | "UPSTREAM_REJECTED" | "INVALID_UPSTREAM_RESPONSE" | "COST_UNKNOWN" | "BUDGET_BLOCKED";
export class ChatJsonError extends Error {
  constructor(readonly code: ChatJsonErrorCode, readonly stage: ChatJsonRequest["stage"], readonly costKnown: boolean, readonly dispatched: boolean) { super(code); this.name = "ChatJsonError"; }
}
export type ChatAttemptEvent = Readonly<{
  stage: ChatJsonRequest["stage"]; attempt: 1 | 2; model: string;
  responseModel: string | null; provider: string | null; latencyMs: number;
  costKnown: boolean; costUsd: number | null; usage: Accounting["usage"];
  outcome: "ok" | "invalid_response" | "http_error" | "error";
  status: number | null;
  schemaProjectionVersion?: SchemaProjectionVersion;
}>;

const messageSchema = z.strictObject({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(64_000) });
const requestSchema = z.strictObject({
  stage: z.enum(["intent", "explanation"]), messages: z.array(messageSchema).min(1).max(32),
  jsonSchema: z.strictObject({ name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), schema: z.record(z.string(), z.unknown()) }),
  deadlineAt: z.number().finite().positive(),
  signal: z.custom<AbortSignal>((value) => value instanceof AbortSignal).optional(),
  purpose: z.enum(["prep", "live_eval", "demo"]).optional(),
});

function immutableJson<T>(value: T): T {
  const text = JSON.stringify(value, (_key, child: unknown) => {
    if (child === undefined || typeof child === "function" || typeof child === "symbol" || typeof child === "bigint" || (typeof child === "number" && !Number.isFinite(child))) throw new Error("INVALID_JSON");
    return child;
  });
  if (Buffer.byteLength(text, "utf8") > 128_000) throw new Error("INVALID_JSON");
  const clone: T = JSON.parse(text);
  const freeze = (child: unknown) => {
    if (child && typeof child === "object") { for (const nested of Object.values(child)) freeze(nested); Object.freeze(child); }
  };
  freeze(clone);
  return clone;
}

function strictSchema(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const node = value as Record<string, unknown>;
  if ("$dynamicRef" in node || "$recursiveRef" in node) throw new Error("INVALID_SCHEMA");
  if ("$ref" in node && (typeof node.$ref !== "string" || !node.$ref.startsWith("#/"))) throw new Error("INVALID_SCHEMA");
  if (node.type === "object" || (Array.isArray(node.type) && node.type.includes("object")) || "properties" in node) {
    if (node.additionalProperties !== false || !node.properties || typeof node.properties !== "object" || Array.isArray(node.properties) || !Array.isArray(node.required)) throw new Error("INVALID_SCHEMA");
    const properties = Object.keys(node.properties);
    if (node.required.length !== properties.length || new Set(node.required).size !== properties.length || node.required.some((key) => typeof key !== "string" || !Object.hasOwn(node.properties!, key))) throw new Error("INVALID_SCHEMA");
  }
  // Walk schema positions, not arbitrary data/field-name containers. A user's
  // property may itself be named "properties" without being a schema keyword.
  for (const key of ["properties", "$defs", "definitions", "patternProperties", "dependentSchemas"]) {
    const children = node[key];
    if (children && typeof children === "object" && !Array.isArray(children)) Object.values(children).forEach(strictSchema);
  }
  for (const key of ["items", "not", "if", "then", "else", "contains"]) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(strictSchema); else strictSchema(child);
  }
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
    const children = node[key];
    if (Array.isArray(children)) children.forEach(strictSchema);
  }
}

// Claude's documented SDK strategy: unsupported bounds become guidance in the
// wire description; the caller's original core Zod schema still validates all
// returned values. Walk schema positions only, never property-name containers.
function anthropicWireSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const projected = structuredClone(schema);
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const node = value as Record<string, unknown>;
    const constraints: Record<string, unknown> = {};
    for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "uniqueItems", "minContains", "maxContains"]) {
      if (Object.hasOwn(node, key)) { constraints[key] = node[key]; delete node[key]; }
    }
    if (Object.hasOwn(node, "minItems") && node.minItems !== 0 && node.minItems !== 1) { constraints.minItems = node.minItems; delete node.minItems; }
    if (Object.keys(constraints).length) {
      const guidance = `Locally validated constraints: ${JSON.stringify(constraints)}`;
      node.description = typeof node.description === "string" ? `${node.description}\n${guidance}` : guidance;
    }
    for (const key of ["properties", "$defs", "definitions", "patternProperties", "dependentSchemas"]) {
      const children = node[key];
      if (children && typeof children === "object" && !Array.isArray(children)) Object.values(children).forEach(visit);
    }
    for (const key of ["items", "not", "if", "then", "else", "contains"]) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
    for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
      const children = node[key];
      if (Array.isArray(children)) children.forEach(visit);
    }
  };
  visit(projected);
  return projected;
}

function protocol(body: unknown): { value?: unknown; failure?: "invalid" | "refusal" } {
  if (!body || typeof body !== "object" || !("choices" in body) || !Array.isArray(body.choices) || body.choices.length !== 1) return { failure: "invalid" };
  const choice = body.choices[0];
  if (!choice || typeof choice !== "object") return { failure: "invalid" };
  const message = choice.message;
  if (!message || typeof message !== "object") return { failure: "invalid" };
  if (message.refusal || choice.finish_reason === "content_filter" || (Array.isArray(message.tool_calls) && message.tool_calls.length)) return { failure: "refusal" };
  if (choice.finish_reason !== "stop" || typeof message.content !== "string") return { failure: "invalid" };
  try {
    const value: unknown = JSON.parse(message.content);
    return value && typeof value === "object" && !Array.isArray(value) ? { value } : { failure: "invalid" };
  } catch { return { failure: "invalid" }; }
}

function mapped(error: unknown, stage: ChatJsonRequest["stage"]): ChatJsonError {
  if (!(error instanceof TransportError)) return new ChatJsonError("COST_UNKNOWN", stage, false, true);
  const code: ChatJsonErrorCode = error.reason === "aborted" ? "REQUEST_ABORTED" : error.reason === "deadline" ? "DEADLINE_EXCEEDED" : error.reason === "timeout" ? "UPSTREAM_TIMEOUT" : error.reason === "http" ? error.status === 429 ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_REJECTED" : error.reason === "budget" ? "BUDGET_BLOCKED" : error.reason === "invalid_request" ? "INVALID_REQUEST" : "COST_UNKNOWN";
  return new ChatJsonError(code, stage, error.costKnown, error.dispatched);
}

function interrupted(stage: ChatJsonRequest["stage"], signal: AbortSignal | undefined, deadlineAt: number): ChatJsonError | undefined {
  if (signal?.aborted) return new ChatJsonError("REQUEST_ABORTED", stage, true, false);
  if (Date.now() >= deadlineAt) return new ChatJsonError("DEADLINE_EXCEEDED", stage, true, false);
}

async function backoff(request: ChatJsonRequest, deadlineAt: number): Promise<void> {
  const existing = interrupted(request.stage, request.signal, deadlineAt);
  if (existing) throw existing;
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); request.signal?.removeEventListener("abort", abort); reject(new ChatJsonError("REQUEST_ABORTED", request.stage, true, true)); };
    const timer = setTimeout(() => { request.signal?.removeEventListener("abort", abort); resolve(); }, 100);
    request.signal?.addEventListener("abort", abort, { once: true });
    if (request.signal?.aborted) abort();
  });
}

export function createChatJson(options: {
  model?: string; transport?: Pick<GuardedTransport, "execute">;
  onAttempt?: (event: ChatAttemptEvent) => void | Promise<void>;
} = {}): ChatJson {
  const model = options.model ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-6-luna";
  const schemaProjectionVersion: SchemaProjectionVersion = model === "anthropic/claude-haiku-5.5" ? "anthropic-bounds-v1" : "identity-v1";
  const notify = (event: ChatAttemptEvent) => {
    try { void Promise.resolve(options.onAttempt?.(Object.freeze(event))).catch(() => {}); }
    catch { /* Metrics must never change billing, retry count or the user result. */ }
  };
  return async (input) => {
    const startedAt = Date.now();
    const stage = input?.stage === "explanation" ? "explanation" : "intent";
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) throw new ChatJsonError("INVALID_REQUEST", stage, true, false);
    const request = parsed.data;
    let payload: { messages: readonly ChatMessage[]; response_format: Record<string, unknown> };
    try {
      if (request.jsonSchema.schema.type !== "object") throw new Error("INVALID_SCHEMA");
      strictSchema(request.jsonSchema.schema);
      const originalSchema = immutableJson(request.jsonSchema.schema);
      const wireSchema = schemaProjectionVersion === "anthropic-bounds-v1" ? anthropicWireSchema(originalSchema) : originalSchema;
      payload = immutableJson({ messages: request.messages, response_format: { type: "json_schema", json_schema: { name: request.jsonSchema.name, strict: true, schema: wireSchema } } });
    } catch { throw new ChatJsonError("INVALID_REQUEST", stage, true, false); }
    const deadlineAt = Math.min(request.deadlineAt, startedAt + 25_000);
    const early = interrupted(stage, request.signal, deadlineAt);
    if (early) throw early;
    let transport: Pick<GuardedTransport, "execute">;
    try { transport = options.transport ?? createLiveTransport(); }
    catch (error) { throw new ChatJsonError(error instanceof Error && error.message === "PAID_CALLS_DISABLED" ? "PAID_CALLS_DISABLED" : "INVALID_REQUEST", stage, true, false); }

    for (const attempt of [1, 2] as const) {
      const cancellation = interrupted(stage, request.signal, deadlineAt);
      if (cancellation) throw cancellation;
      const attemptStart = Date.now();
      const emit = (outcome: ChatAttemptEvent["outcome"], accounting?: Accounting, status: number | null = null) => notify({ stage, attempt, model, responseModel: accounting?.responseModel ?? null, provider: accounting?.provider ?? null, latencyMs: Math.max(0, Date.now() - attemptStart), costKnown: accounting !== undefined, costUsd: accounting?.costUsd ?? null, usage: accounting?.usage ?? { promptTokens: null, completionTokens: null, totalTokens: null }, outcome, status, schemaProjectionVersion });
      let retry = false;
      let failure: ChatJsonError;
      let quote;
      try { quote = quoteRequest({ operation: stage, model, maxCompletionTokens: stage === "intent" ? 400 : 1000 }); }
      catch { throw new ChatJsonError("INVALID_REQUEST", stage, true, false); }
      try {
        const body = await transport.execute({ purpose: request.purpose ?? "prep", quote, body: payload, signal: request.signal, deadlineAt, timeoutMs: 15_000 });
        const accounting = responseAccounting(body);
        if (!accounting) throw new ChatJsonError("COST_UNKNOWN", stage, false, true);
        const result = protocol(body);
        emit(result.failure ? "invalid_response" : "ok", accounting, 200);
        const afterResponse = interrupted(stage, request.signal, deadlineAt);
        if (afterResponse) throw new ChatJsonError(afterResponse.code, stage, true, true);
        if (!result.failure) return result.value;
        failure = new ChatJsonError(result.failure === "refusal" ? "UPSTREAM_REJECTED" : "INVALID_UPSTREAM_RESPONSE", stage, true, true);
        retry = result.failure === "invalid";
      } catch (error) {
        if (error instanceof ChatJsonError) throw error;
        failure = mapped(error, stage);
        if (error instanceof TransportError) {
          if (error.durablyRecorded) emit(error.reason === "http" ? "http_error" : "error", error.accounting, Number.isInteger(error.status) ? error.status! : null);
          retry = error.costKnown && error.durablyRecorded && error.reason === "http" && [429, 502, 503, 504].includes(error.status ?? 0);
        }
      }
      const beforeRetry = interrupted(stage, request.signal, deadlineAt);
      if (beforeRetry) throw new ChatJsonError(beforeRetry.code, stage, failure.costKnown, failure.dispatched);
      if (attempt === 2 || !retry || Date.now() + 100 >= deadlineAt) throw failure;
      await backoff(request, deadlineAt);
    }
    throw new ChatJsonError("INVALID_UPSTREAM_RESPONSE", stage, false, false);
  };
}
