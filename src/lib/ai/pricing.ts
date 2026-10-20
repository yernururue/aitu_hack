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
  "mistralai/mistral-small-3.2-24b-instruct": { kind: "chat", context: 256000, output: 16384, prompt: "0.00000009375", completion: "0.00000025", cache: "0", parameter: "max_tokens" },
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
  reasoning?: Readonly<{ enabled: false }>;
  billing: Readonly<{ inputUsdPerToken: string; completionUsdPerToken: string; maxOutputTokens: number; cacheWriteMaxMultiplier?: 2 }>;
  provider: Readonly<{
    only?: readonly [string];
    allow_fallbacks: false; require_parameters: true;
    max_price: Readonly<{ prompt: string; completion: string; request: "0"; image: "0"; audio: "0" }>;
  }>;
}>;
const issuedQuotes = new WeakSet<Quote>();
export function isIssuedQuote(quote: Quote): boolean { return issuedQuotes.has(quote); }

// Exact decimal unit conversion; float multiplication serialized Luna's intended
// 0.2/M cap as 0.19999999999999998/M and rejected its own published tier.
function perMillion(price: string): string {
  const [whole, fraction = ""] = price.split(".");
  const integer = (whole + fraction.slice(0, 6).padEnd(6, "0")).replace(/^0+(?=\d)/, "");
  const remainder = fraction.slice(6).replace(/0+$/, "");
  return integer + (remainder ? `.${remainder}` : "");
}

export function quoteRequest(args: { operation: Operation; model: string; inputCount?: number; maxCompletionTokens?: number }): Quote {
  if (!Object.hasOwn(models, args.model)) throw new Error("UNKNOWN_MODEL");
  const model = models[args.model as keyof typeof models];
  const embedding = args.operation === "index_embedding" || args.operation === "query_embedding";
  if ((!embedding && args.operation !== "intent" && args.operation !== "explanation") || (embedding ? model.kind !== "embedding" : model.kind !== "chat")) throw new Error("UNAUTHORIZED_OPERATION");
  if (embedding && (!Number.isSafeInteger(args.inputCount) || args.inputCount! < 1 || args.inputCount! > 64)) throw new Error("INVALID_INPUT_COUNT");
  if (!embedding && (!Number.isSafeInteger(args.maxCompletionTokens) || args.maxCompletionTokens! < 16 || args.maxCompletionTokens! > model.output)) throw new Error("INVALID_TOKEN_LIMIT");
  // OpenRouter's max_price is the contractual accepted-rate ceiling, including
  // conditional tiers. Higher tiers must reject instead of charging more.
  // Only the verified global Azure endpoint supports this model's required
  // parameters at these caps. Keep *full* context/output and allow the maximum
  // documented 2x cache-write price even without requesting prompt caching.
  const pinnedHaiku = args.model === "anthropic/claude-haiku-5.5";
  // Deterministic Qwen route candidate, not a claim of separate quota or a429 fix.
  // The regional endpoint keeps the same full cache/context/output reserve.
  // Offline Mistral candidate: fixed FP8 endpoint advertises128k context and
  // lower rates, but reserve the full256k model envelope at model-level maxima.
  const pinnedProvider = pinnedHaiku ? "azure/global"
    : args.model === "qwen/qwen3.8-flash" ? "alibaba/us-east-1"
    : args.model === "mistralai/mistral-small-3.2-24b-instruct" ? "deepinfra/fp8" : undefined;
  const promptPrice = pinnedHaiku ? "0.0000001" : model.prompt;
  const completionPrice = pinnedHaiku ? "0.0000005" : model.completion;
  const inputPrice = pinnedHaiku ? "0.0000002" : parseTokenPrice(model.cache) > parseTokenPrice(promptPrice) ? model.cache : promptPrice;
  const prompt = parseTokenPrice(promptPrice);
  const completion = parseTokenPrice(completionPrice);
  const inputRate = parseTokenPrice(inputPrice);
  const raw = embedding ? model.context * prompt * args.inputCount! : model.context * inputRate + model.output * completion;
  const quote: Quote = Object.freeze({
    operation: args.operation as Quote["operation"], model: args.model,
    estimatedUsd: nanoUsd(raw) / 1e9, contextLength: model.context,
    ...(embedding ? { inputCount: args.inputCount } : { maxCompletionTokens: args.maxCompletionTokens }),
    outputParameter: model.parameter,
    // Haiku 5.5 defaults to adaptive thinking; explicitly disable it so the
    // fixed 400/1000 stage limits are available to visible structured output.
    ...(pinnedHaiku ? { reasoning: Object.freeze({ enabled: false as const }) } : {}),
    billing: Object.freeze({ inputUsdPerToken: inputPrice, completionUsdPerToken: completionPrice, maxOutputTokens: model.output, ...(pinnedHaiku ? { cacheWriteMaxMultiplier: 2 as const } : {}) }),
    provider: Object.freeze({ ...(pinnedProvider ? { only: Object.freeze([pinnedProvider] as [string]) } : {}), allow_fallbacks: false, require_parameters: true, max_price: Object.freeze({ prompt: perMillion(promptPrice), completion: perMillion(completionPrice), request: "0", image: "0", audio: "0" }) }),
  });
  issuedQuotes.add(quote);
  return quote;
}
