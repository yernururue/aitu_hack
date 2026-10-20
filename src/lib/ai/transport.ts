// Node imports transitively prevent accidental client bundling. No provider SDK
// retries: each explicit execute call must reserve and reconcile its own attempt.
import { BudgetGuard } from "./budget";
import { readAiConfig, validUsd, type Purpose } from "./config";
import { isIssuedQuote, type Quote } from "./pricing";
import { z } from "zod";

export type ProviderRequest = { endpoint: "embeddings" | "chat/completions"; model: string; body: Record<string, unknown> };
export type ProviderResponse = { status: number; body: unknown };
export type ProviderSend = (request: ProviderRequest, signal: AbortSignal) => Promise<ProviderResponse>;
export type TransportReason = "aborted" | "deadline" | "timeout" | "network" | "unknown_cost" | "http" | "budget" | "invalid_request";
export type Accounting = Readonly<{
  costUsd: number; provider: string | null; responseModel: string | null;
  usage: Readonly<{ promptTokens: number | null; completionTokens: number | null; totalTokens: number | null }>;
}>;
export class TransportError extends Error {
  readonly costKnown: boolean;
  readonly dispatched: boolean;
  readonly durablyRecorded: boolean;
  readonly status?: number;
  readonly generationId?: string;
  readonly accounting?: Accounting;
  constructor(readonly code: string, readonly reason: TransportReason, options: { costKnown?: boolean; dispatched?: boolean; durablyRecorded?: boolean; status?: number; generationId?: string; accounting?: Accounting } = {}) {
    super(code);
    this.name = "TransportError";
    this.costKnown = options.costKnown ?? false;
    this.dispatched = options.dispatched ?? false;
    this.durablyRecorded = options.durablyRecorded ?? false;
    this.status = Number.isInteger(options.status) && options.status! >= 100 && options.status! <= 599 ? options.status : undefined;
    this.generationId = safeGenerationId(options.generationId);
    this.accounting = options.accounting;
  }
}
function safeGenerationId(value: unknown): string | undefined {
  return typeof value === "string" && value.length >= 5 && value.length <= 128 && value.startsWith("gen-") && /[A-Za-z0-9]/.test(value.charAt(4)) && !/[^A-Za-z0-9_-]/.test(value) ? value : undefined;
}
function responseGenerationId(body: unknown): string | undefined {
  return body && typeof body === "object" && "id" in body ? safeGenerationId(body.id) : undefined;
}
export type ExecuteRequest = {
  purpose: Purpose; quote: Quote; body: unknown;
  signal?: AbortSignal; deadlineAt?: number; timeoutMs?: number;
};
const textMessage = z.strictObject({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1) });
const embeddingBody = z.strictObject({ input: z.array(z.string().min(1)).min(1).max(64), dimensions: z.number().int().min(1).max(1536).optional(), encoding_format: z.literal("float").optional(), input_type: z.enum(["search_query", "search_document"]).optional() });
const chatBody = z.strictObject({ messages: z.array(textMessage).min(1).max(32), response_format: z.record(z.string(), z.unknown()).optional() });

function providerRequest(quote: Quote, body: unknown): ProviderRequest {
  if (!isIssuedQuote(quote)) throw new Error("INVALID_QUOTE");
  const embedding = quote.inputCount !== undefined;
  const parsed = (embedding ? embeddingBody : chatBody).safeParse(body);
  if (!parsed.success) throw new Error("UNSUPPORTED_REQUEST");
  if (embedding) {
    const input = (parsed.data as z.infer<typeof embeddingBody>).input;
    if (input.length !== quote.inputCount || input.some((text) => Buffer.byteLength(text, "utf8") > quote.contextLength)) throw new Error("INVALID_INPUT_COUNT");
  } else {
    const messages = (parsed.data as z.infer<typeof chatBody>).messages;
    if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > quote.contextLength) throw new Error("INVALID_INPUT_SIZE");
    if (messages.some((message) => message.content.length === 0)) throw new Error("UNSUPPORTED_REQUEST");
  }
  return {
    endpoint: embedding ? "embeddings" : "chat/completions", model: quote.model,
    body: { ...parsed.data, model: quote.model, provider: quote.provider, ...(!embedding ? { stream: false, [quote.outputParameter]: quote.maxCompletionTokens, ...(quote.reasoning ? { reasoning: quote.reasoning } : {}) } : {}) },
  };
}

function actualCost(body: unknown): number | null {
  if (!body || typeof body !== "object" || !("usage" in body)) return null;
  const usage = body.usage;
  if (usage && typeof usage === "object" && "is_byok" in usage && usage.is_byok !== false) return null;
  if (!usage || typeof usage !== "object" || !("cost" in usage) || !validUsd(usage.cost)) return null;
  return usage.cost;
}

export function responseAccounting(body: unknown): Accounting | undefined {
  const cost = actualCost(body);
  if (cost === null || !body || typeof body !== "object") return;
  const record = body as Record<string, unknown>;
  const usage = record.usage as Record<string, unknown>;
  const token = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const metadata = (value: unknown) => typeof value === "string" && /^[a-z][a-z0-9 ._:/-]{0,127}$/i.test(value) ? value : null;
  return Object.freeze({ costUsd: cost, provider: metadata(record.provider), responseModel: metadata(record.model), usage: Object.freeze({ promptTokens: token(usage.prompt_tokens), completionTokens: token(usage.completion_tokens), totalTokens: token(usage.total_tokens) }) });
}

function guardFailure(error: unknown, dispatched: boolean): TransportError {
  const code = error instanceof Error && /^(?:LEDGER_[A-Z_]+|BUDGET_EXCEEDED|CONCURRENCY_EXCEEDED|RESERVATION_EXCEEDED|INVALID_RESERVATION_STATE|LIVE_EVAL_DISABLED)$/.test(error.message) ? error.message : "BUDGET_BLOCKED";
  return new TransportError(code, "budget", { dispatched });
}

export class GuardedTransport {
  private readonly timeoutMs: number;
  constructor(private readonly options: { guard: BudgetGuard; send: ProviderSend; timeoutMs?: number; liveEvalEnabled?: boolean }) {
    this.timeoutMs = options.timeoutMs ?? 25_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 25_000) throw new Error("INVALID_TIMEOUT");
  }

  async execute(args: ExecuteRequest): Promise<unknown> {
    if (args.purpose === "live_eval" && !this.options.liveEvalEnabled) throw new TransportError("LIVE_EVAL_DISABLED", "budget");
    const timeout = args.timeoutMs ?? this.timeoutMs;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 25_000 || (args.deadlineAt !== undefined && !Number.isFinite(args.deadlineAt))) throw new TransportError("INVALID_TIMEOUT", "invalid_request");
    if (args.signal?.aborted) throw new TransportError("REQUEST_ABORTED", "aborted", { costKnown: true });
    if (args.deadlineAt !== undefined && args.deadlineAt <= Date.now()) throw new TransportError("DEADLINE_EXCEEDED", "deadline", { costKnown: true });
    const request = providerRequest(args.quote, args.body);
    // Preserve M2 constructor-only provider timeout semantics. Explicit M3
    // controls include the reservation time in the attempt/request deadline.
    const boundedBeforeSend = args.timeoutMs !== undefined || args.deadlineAt !== undefined;
    let attemptDeadline = boundedBeforeSend ? Math.min(Date.now() + timeout, args.deadlineAt ?? Infinity) : Infinity;
    const timerReason: TransportReason = args.deadlineAt !== undefined && args.deadlineAt <= Date.now() + timeout ? "deadline" : "timeout";
    const controller = new AbortController();
    let reason: TransportReason | undefined;
    let interrupt!: () => void;
    const interruption = new Promise<never>((_, reject) => { interrupt = () => reject(new Error("CANCELLED")); });
    // Cancellation may occur while the disk transaction is pending. Observe the
    // promise immediately; after disk cleanup we must never start a deferred send.
    void interruption.catch(() => {});
    const stop = (value: TransportReason) => { if (!reason) { reason = value; controller.abort(); interrupt(); } };
    const onAbort = () => stop("aborted");
    args.signal?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startTimer = () => { timer = setTimeout(() => stop(timerReason), Math.max(0, attemptDeadline - Date.now())); };
    if (boundedBeforeSend) startTimer();
    const cancellation = () => {
      if (args.signal?.aborted) stop("aborted");
      if (Date.now() >= attemptDeadline) stop(timerReason);
      return reason ? new TransportError(reason === "aborted" ? "REQUEST_ABORTED" : reason === "deadline" ? "DEADLINE_EXCEEDED" : "UPSTREAM_TIMEOUT", reason, { costKnown: true }) : undefined;
    };
    try {
      let reservation;
      try { reservation = await this.options.guard.reserve({ purpose: args.purpose, operation: args.quote.operation, estimatedUsd: args.quote.estimatedUsd }); }
      catch (error) { throw guardFailure(error, false); }
      const beforeMark = cancellation();
      if (beforeMark) {
        try { await this.options.guard.releaseBeforeDispatch(reservation); } catch (error) { throw guardFailure(error, false); }
        throw beforeMark;
      }
      try { await this.options.guard.markDispatched(reservation); } catch (error) { throw guardFailure(error, false); }
      const beforeSend = cancellation();
      if (beforeSend) {
        // We know send was never invoked; explicit zero is proven here, unlike
        // interpreting an HTTP/network failure as free.
        try { await this.options.guard.settle(reservation, 0); } catch (error) { throw guardFailure(error, false); }
        throw beforeSend;
      }
      if (!boundedBeforeSend) { attemptDeadline = Date.now() + timeout; startTimer(); }
      let response: ProviderResponse;
      try { response = await Promise.race([this.options.send(request, controller.signal), interruption]); }
      catch {
        let durable = false;
        try { await this.options.guard.settle(reservation, null); }
        catch (error) {
          if (error instanceof Error && error.message === "COST_UNKNOWN") durable = true;
          else throw guardFailure(error, true);
        }
        throw new TransportError("COST_UNKNOWN", reason ?? "network", { dispatched: true, durablyRecorded: durable });
      }
      const accounting = responseAccounting(response?.body);
      const diagnostics = { status: response?.status, generationId: responseGenerationId(response?.body) };
      try { await this.options.guard.settle(reservation, actualCost(response?.body)); }
      catch (error) {
        if (error instanceof Error && error.message === "COST_UNKNOWN") throw new TransportError("COST_UNKNOWN", "unknown_cost", { dispatched: true, durablyRecorded: true, ...diagnostics });
        if (error instanceof Error && error.message === "RESERVATION_EXCEEDED") throw new TransportError("RESERVATION_EXCEEDED", "budget", { dispatched: true, costKnown: true, durablyRecorded: true, accounting, ...diagnostics });
        throw guardFailure(error, true);
      }
      const metadata = { costKnown: true, dispatched: true, durablyRecorded: true, accounting, ...diagnostics };
      const afterSettlement = cancellation();
      if (afterSettlement) throw new TransportError(afterSettlement.message, afterSettlement.reason, metadata);
      if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) throw new TransportError("UPSTREAM_REJECTED", "http", { ...metadata, status: response.status });
      return response.body;
    } finally {
      if (timer) clearTimeout(timer);
      args.signal?.removeEventListener("abort", onAbort);
    }
  }
}

export function createLiveTransport(): GuardedTransport {
  const config = readAiConfig();
  if (!config.paidEnabled) throw new Error("PAID_CALLS_DISABLED");
  const guard = new BudgetGuard({ path: config.ledgerPath, caps: config.caps });
  const send: ProviderSend = async (request, signal) => {
    const response = await fetch(`https://openrouter.ai/api/v1/${request.endpoint}`, {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request.body), redirect: "error", signal,
    });
    return { status: response.status, body: await response.json() };
  };
  return new GuardedTransport({ guard, send, liveEvalEnabled: config.liveEvalEnabled });
}
