// Node imports transitively prevent accidental client bundling. No provider SDK
// retries: each explicit execute call must reserve and reconcile its own attempt.
import { BudgetGuard } from "./budget";
import { readAiConfig, validUsd, type Purpose } from "./config";
import { isIssuedQuote, type Quote } from "./pricing";
import { z } from "zod";

export type ProviderRequest = { endpoint: "embeddings" | "chat/completions"; model: string; body: Record<string, unknown> };
export type ProviderResponse = { status: number; body: unknown };
export type ProviderSend = (request: ProviderRequest, signal: AbortSignal) => Promise<ProviderResponse>;
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
    body: { ...parsed.data, model: quote.model, provider: quote.provider, ...(!embedding ? { stream: false, [quote.outputParameter]: quote.maxCompletionTokens } : {}) },
  };
}

function actualCost(body: unknown): number | null {
  if (!body || typeof body !== "object" || !("usage" in body)) return null;
  const usage = body.usage;
  if (usage && typeof usage === "object" && "is_byok" in usage && usage.is_byok !== false) return null;
  if (!usage || typeof usage !== "object" || !("cost" in usage) || !validUsd(usage.cost)) return null;
  return usage.cost;
}

export class GuardedTransport {
  private readonly timeoutMs: number;
  constructor(private readonly options: { guard: BudgetGuard; send: ProviderSend; timeoutMs?: number; liveEvalEnabled?: boolean }) {
    this.timeoutMs = options.timeoutMs ?? 25_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 25_000) throw new Error("INVALID_TIMEOUT");
  }

  async execute(args: { purpose: Purpose; quote: Quote; body: unknown }): Promise<unknown> {
    if (args.purpose === "live_eval" && !this.options.liveEvalEnabled) throw new Error("LIVE_EVAL_DISABLED");
    const request = providerRequest(args.quote, args.body);
    const reservation = await this.options.guard.reserve({ purpose: args.purpose, operation: args.quote.operation, estimatedUsd: args.quote.estimatedUsd });
    await this.options.guard.markDispatched(reservation);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let response: ProviderResponse;
    try {
      response = await Promise.race([
        this.options.send(request, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("UPSTREAM_TIMEOUT")); }, this.timeoutMs); }),
      ]);
    } catch {
      await this.options.guard.settle(reservation, null); // persists uncertainty, throws COST_UNKNOWN
      throw new Error("COST_UNKNOWN");
    } finally { if (timer) clearTimeout(timer); }
    // Reconcile before schema/business validation or HTTP handling: failures cost too.
    await this.options.guard.settle(reservation, actualCost(response.body));
    if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) throw new Error("UPSTREAM_REJECTED");
    return response.body;
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
