import { z } from "zod";
import { isIssuedQuote, parseTokenPrice, type Quote } from "./pricing";

const prices = {
  prompt: z.string(), completion: z.string(), input_cache_read: z.string().optional(),
  input_cache_write: z.string().optional(), input_cache_write_1h: z.string().optional(),
  request: z.string().optional(), image: z.string().optional(), audio: z.string().optional(),
  video: z.string().optional(), web_search: z.string().optional(),
};
const tierSchema = z.strictObject({ ...prices, min_prompt_tokens: z.number().int().positive() });
const priceSchema = z.strictObject({ ...prices, discount: z.number().min(0).max(1).optional(), overrides: z.array(tierSchema).optional() });
const limits = { context_length: z.number().int().positive(), supported_parameters: z.array(z.string()) };
const modelSchema = z.object({ ...limits, id: z.string(), top_provider: z.object({ max_completion_tokens: z.number().int().positive() }), pricing: priceSchema });
const endpointSchema = z.object({ ...limits, model_id: z.string(), tag: z.string(), max_completion_tokens: z.number().int().positive(), max_prompt_tokens: z.number().int().positive().nullable().optional(), pricing: priceSchema });
const envelopeSchema = z.object({ data: z.object({ id: z.string(), endpoints: z.array(z.unknown()) }) });
type Prices = z.infer<typeof priceSchema>;

// Compare decimal prices exactly, including USD/token -> USD/M comparisons.
// These are metadata/rate proofs, never caller-provided token estimates.
function atMost(left: string, right: string, leftFactor = 1, rightFactor = 1): boolean {
  parseTokenPrice(left); parseTokenPrice(right);
  const [a, b = ""] = left.split("."); const [c, d = ""] = right.split(".");
  const length = Math.max(b.length, d.length);
  return BigInt(a + b.padEnd(length, "0")) * BigInt(leftFactor) <= BigInt(c + d.padEnd(length, "0")) * BigInt(rightFactor);
}
function baseFits(price: Prices, quote: Quote): boolean {
  return atMost(price.prompt, quote.provider.max_price.prompt, 1e6) && atMost(price.completion, quote.provider.max_price.completion, 1e6);
}
function checkPricing(price: Prices, quote: Quote): void {
  let threshold = 0;
  const tiers = [price, ...(price.overrides ?? []).map((tier) => {
    if (tier.min_prompt_tokens <= threshold || tier.min_prompt_tokens > quote.contextLength) throw new Error();
    threshold = tier.min_prompt_tokens;
    return { ...price, ...tier };
  })];
  if (!baseFits(price, quote)) throw new Error();
  for (const tier of tiers) {
    for (const key of Object.keys(prices) as (keyof typeof prices)[]) if (tier[key] !== undefined) parseTokenPrice(tier[key]);
    // Text-only strict transport cannot enable search/tools/plugins. Request
    // charges are always applicable; other modalities are also hard-capped0.
    for (const key of ["request", "image", "audio", "video"] as const) if (tier[key] !== undefined && !atMost(tier[key], "0")) throw new Error();
    const inputPrices = [tier.prompt, tier.input_cache_read, tier.input_cache_write, tier.input_cache_write_1h].filter((value): value is string => value !== undefined);
    if (quote.billing.cacheWriteMaxMultiplier && inputPrices.some((value) => !atMost(value, tier.prompt, 1, quote.billing.cacheWriteMaxMultiplier))) throw new Error();
    // Contractual max_price rejects higher *effective* prompt/output tiers.
    // Validate their shape/cache ratio too; never relabel them as cheap tiers.
    if (!baseFits(tier, quote)) continue;
    if (inputPrices.some((value) => !atMost(value, quote.billing.inputUsdPerToken)) || !atMost(tier.completion, quote.billing.completionUsdPerToken)) throw new Error();
  }
}

/** No I/O. Pass the exact selected /models record and full /endpoints response.
 * Valid only with issued quotes and the existing strict text-only transport.
 * Higher conditional tiers rely on OpenRouter's contractual hard rate caps.
 */
export function verifyQuoteMetadata(quote: Quote, input: { model: unknown; endpoints: unknown }): void {
  try {
    if (!isIssuedQuote(quote) || quote.inputCount !== undefined) throw new Error();
    const required = [quote.outputParameter, "response_format", "structured_outputs"];
    const validLimits = (item: { context_length: number; supported_parameters: string[] }, output: number) => {
      if (item.context_length > quote.contextLength || item.context_length < quote.maxCompletionTokens! || output > quote.billing.maxOutputTokens || output < quote.maxCompletionTokens! || required.some((key) => !item.supported_parameters.includes(key))) throw new Error();
    };
    const model = modelSchema.parse(input.model);
    if (model.id !== quote.model) throw new Error();
    validLimits(model, model.top_provider.max_completion_tokens);
    checkPricing(model.pricing, quote);
    const envelope = envelopeSchema.parse(input.endpoints).data;
    if (envelope.id !== quote.model) throw new Error();
    const selected = quote.provider.only
      ? envelope.endpoints.filter((item) => item && typeof item === "object" && "tag" in item && item.tag === quote.provider.only![0])
      : envelope.endpoints.filter((item) => {
        const parsed = endpointSchema.parse(item);
        return required.every((key) => parsed.supported_parameters.includes(key)) && baseFits(parsed.pricing, quote);
      });
    if (!selected.length || (quote.provider.only && selected.length !== 1)) throw new Error();
    for (const raw of selected) {
      const endpoint = endpointSchema.parse(raw);
      if (endpoint.model_id !== quote.model || (endpoint.max_prompt_tokens !== null && endpoint.max_prompt_tokens !== undefined && endpoint.max_prompt_tokens > quote.contextLength)) throw new Error();
      validLimits(endpoint, endpoint.max_completion_tokens);
      checkPricing(endpoint.pricing, quote);
    }
  } catch { throw new Error("MODEL_METADATA_CHANGED"); }
}
