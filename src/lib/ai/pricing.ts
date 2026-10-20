import { nanoUsd } from "./config";
import type { Operation } from "./budget";

// Public OpenRouter /models and per-model /endpoints verified 2026-10-20.
// USD/token; reserve endpoint cache-write maxima, including regional/context
// tiers absent from the model-level price. Never substitute advertised base
// prices or a text-length estimate for the full context/output bounds below.
const models = {
  "openai/text-embedding-3-small": { kind: "embedding", context: 8192, output: 0, prompt: "0.00000002", completion: "0", cache: "0", parameter: "max_completion_tokens" },
  "openai/gpt-6-luna": { kind: "chat", context: 1050000, output: 128000, prompt: "0.0000002", completion: "0.00000075", cache: "0.000000275", parameter: "max_completion_tokens" },
  "anthropic/claude-haiku-5.5": { kind: "chat", context: 1000000, output: 128000, prompt: "0.0000005", completion: "0.0000025", cache: "0.0000011", parameter: "max_completion_tokens" },
  "qwen/qwen3.8-flash": { kind: "chat", context: 1000000, output: 131072, prompt: "0.00000015", completion: "0.00000047", cache: "0.0000002", parameter: "max_tokens" },
} as const;

export function parseTokenPrice(value: unknown): number {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error("UNKNOWN_PRICE");
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(price * 1e6) || (price === 0 && /[1-9]/.test(value))) throw new Error("UNKNOWN_PRICE");
  return price;
}

export type Quote = Readonly<{
  operation: Exclude<Operation, "audio">; model: string; estimatedUsd: number;
  inputCount?: number; maxCompletionTokens?: number; contextLength: number;
  outputParameter: "max_tokens" | "max_completion_tokens";
  provider: Readonly<{
    allow_fallbacks: false; require_parameters: true;
    max_price: Readonly<{ prompt: string; completion: string; request: "0"; image: "0"; audio: "0" }>;
  }>;
}>;
const issuedQuotes = new WeakSet<Quote>();
export function isIssuedQuote(quote: Quote): boolean { return issuedQuotes.has(quote); }

export function quoteRequest(args: { operation: Operation; model: string; inputCount?: number; maxCompletionTokens?: number }): Quote {
  if (!Object.hasOwn(models, args.model)) throw new Error("UNKNOWN_MODEL");
  const model = models[args.model as keyof typeof models];
  const embedding = args.operation === "index_embedding" || args.operation === "query_embedding";
  if ((!embedding && args.operation !== "intent" && args.operation !== "explanation") || (embedding ? model.kind !== "embedding" : model.kind !== "chat")) throw new Error("UNAUTHORIZED_OPERATION");
  if (embedding && (!Number.isSafeInteger(args.inputCount) || args.inputCount! < 1 || args.inputCount! > 64)) throw new Error("INVALID_INPUT_COUNT");
  if (!embedding && (!Number.isSafeInteger(args.maxCompletionTokens) || args.maxCompletionTokens! < 16 || args.maxCompletionTokens! > model.output)) throw new Error("INVALID_TOKEN_LIMIT");
  const prompt = parseTokenPrice(model.prompt);
  const completion = parseTokenPrice(model.completion);
  const inputRate = Math.max(prompt, parseTokenPrice(model.cache));
  const raw = embedding ? model.context * prompt * args.inputCount! : model.context * inputRate + model.output * completion;
  const quote: Quote = Object.freeze({
    operation: args.operation as Quote["operation"], model: args.model,
    estimatedUsd: nanoUsd(raw) / 1e9, contextLength: model.context,
    ...(embedding ? { inputCount: args.inputCount } : { maxCompletionTokens: args.maxCompletionTokens }),
    outputParameter: model.parameter,
    provider: Object.freeze({ allow_fallbacks: false, require_parameters: true, max_price: Object.freeze({ prompt: String(prompt * 1e6), completion: String(completion * 1e6), request: "0", image: "0", audio: "0" }) }),
  });
  issuedQuotes.add(quote);
  return quote;
}
