import { describe, expect, it } from "vitest";
import { quoteRequest } from "../../src/lib/ai/pricing";
import { verifyQuoteMetadata } from "../../src/lib/ai/metadata";

function fixture(model = "anthropic/claude-haiku-5.5") {
  const haiku = model.startsWith("anthropic/");
  const luna = model.startsWith("openai/");
  const quote = quoteRequest({ operation: "explanation", model, maxCompletionTokens: 1000 });
  const pricing = haiku
    ? { prompt: "0.0000001", completion: "0.0000005", input_cache_read: "0.00000001", input_cache_write: "0.000000125", input_cache_write_1h: "0.0000002", web_search: "0.01", overrides: [{ min_prompt_tokens: 100000, prompt: "0.0000005", completion: "0.0000025", input_cache_read: "0.00000005", input_cache_write: "0.000000625", input_cache_write_1h: "0.000001" }] }
    : luna
      ? { prompt: "0.0000001", completion: "0.0000005", input_cache_write: "0.000000125", overrides: [{ min_prompt_tokens: 272000, prompt: "0.0000002", completion: "0.00000075", input_cache_write: "0.00000025" }] }
      : { prompt: "0.00000015", completion: "0.00000047", input_cache_read: "0.000000016", input_cache_write: "0.0000002" };
  const params = [quote.outputParameter, "response_format", "structured_outputs", ...(haiku ? ["reasoning"] : [])];
  const modelData = { id: model, context_length: quote.contextLength, top_provider: { max_completion_tokens: quote.billing.maxOutputTokens }, supported_parameters: params, pricing, reasoning: haiku ? { mandatory: false, supported_efforts: ["low", "medium", "high", "none"] } : undefined };
  const endpoint = { model_id: model, tag: haiku ? "azure/global" : luna ? "azure" : "alibaba", context_length: quote.contextLength, max_completion_tokens: quote.billing.maxOutputTokens, max_prompt_tokens: null as number | null, supported_parameters: params, pricing: { ...structuredClone(pricing), discount: 0 } };
  return { quote, input: { model: modelData, endpoints: { data: { id: model, endpoints: [endpoint] } } }, endpoint };
}

describe("pure current endpoint metadata preflight", () => {
  it.each(["openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "qwen/qwen3.8-flash"])("accepts verified %s rates and enforced/disallowed tiers without network", (model) => {
    const { quote, input } = fixture(model);
    expect(() => verifyQuoteMetadata(quote, input)).not.toThrow();
  });
  it("does not pretend Haiku's higher conditional prices are the accepted rate", () => {
    const { quote, input, endpoint } = fixture();
    expect(endpoint.pricing.overrides![0].prompt).toBe("0.0000005");
    expect(quote.provider.max_price.prompt).toBe("0.1");
    expect(() => verifyQuoteMetadata(quote, input)).not.toThrow();
  });
  it("preserves Qwen's published reasoning metadata shape without imposing Haiku's disable policy", () => {
    const { quote, input } = fixture("qwen/qwen3.8-flash");
    expect(() => verifyQuoteMetadata(quote, { ...input, model: { ...input.model, reasoning: { mandatory: false, default_enabled: true, supports_max_tokens: true } } })).not.toThrow();
  });
  it.each([
    "regional", "missing", "duplicate", "wrong-model", "model-context", "model-output", "endpoint-context", "endpoint-output", "prompt-ceiling",
    "max_completion_tokens", "response_format", "structured_outputs", "reasoning", "model-reasoning", "mandatory-reasoning", "missing-reasoning-policy", "no-disable-effort", "base-prompt", "base-completion", "price-shape", "unknown-price", "request-price", "negative-discount", "cache-ratio", "excluded-tier-cache-ratio", "cache-read-ratio", "threshold", "duplicate-threshold", "time-window",
  ])("fails closed on %s metadata drift", (kind) => {
    const { quote, input, endpoint } = fixture();
    const model = input.model;
    const data = input.endpoints.data;
    const prices = endpoint.pricing as Record<string, unknown>;
    if (kind === "regional") endpoint.tag = "azure/us";
    if (kind === "missing") data.endpoints = [];
    if (kind === "duplicate") data.endpoints.push(structuredClone(endpoint));
    if (kind === "wrong-model") endpoint.model_id = "anthropic/other";
    if (kind === "model-context") model.context_length++;
    if (kind === "model-output") model.top_provider.max_completion_tokens++;
    if (kind === "endpoint-context") endpoint.context_length++;
    if (kind === "endpoint-output") endpoint.max_completion_tokens++;
    if (kind === "prompt-ceiling") endpoint.max_prompt_tokens = quote.contextLength + 1;
    if (["max_completion_tokens", "response_format", "structured_outputs", "reasoning"].includes(kind)) endpoint.supported_parameters = endpoint.supported_parameters.filter((name) => name !== kind);
    if (kind === "model-reasoning") model.supported_parameters = model.supported_parameters.filter((name) => name !== "reasoning");
    if (kind === "mandatory-reasoning") model.reasoning!.mandatory = true;
    if (kind === "missing-reasoning-policy") model.reasoning = undefined;
    if (kind === "no-disable-effort") model.reasoning!.supported_efforts = ["medium"];
    if (kind === "base-prompt") prices.prompt = "0.00000011";
    if (kind === "base-completion") prices.completion = "0.00000055";
    if (kind === "price-shape") prices.prompt = "1e-7";
    if (kind === "unknown-price") prices.internal_reasoning = "0.0001";
    if (kind === "request-price") prices.request = "0.01";
    if (kind === "negative-discount") prices.discount = -0.1;
    if (kind === "cache-ratio") prices.input_cache_write_1h = "0.00000021";
    if (kind === "cache-read-ratio") prices.input_cache_read = "0.00000021";
    const tiers = prices.overrides as Record<string, unknown>[];
    if (kind === "excluded-tier-cache-ratio") tiers[0].input_cache_write_1h = "0.0000011";
    if (kind === "threshold") tiers[0].min_prompt_tokens = 0;
    if (kind === "duplicate-threshold") tiers.push(structuredClone(tiers[0]));
    if (kind === "time-window") tiers[0].utc_start = "12:00";
    expect(() => verifyQuoteMetadata(quote, input)).toThrow("MODEL_METADATA_CHANGED");
  });
  it("rejects a new eligible Qwen cache-write charge above the separate input ceiling", () => {
    const { quote, input, endpoint } = fixture("qwen/qwen3.8-flash");
    (endpoint.pricing as Record<string, unknown>).input_cache_write = "0.00000021";
    expect(() => verifyQuoteMetadata(quote, input)).toThrow("MODEL_METADATA_CHANGED");
  });
  it("rejects forged immutable-looking metadata/price policy without issuing a provider call", () => {
    const { quote, input } = fixture();
    expect(() => verifyQuoteMetadata({ ...quote, estimatedUsd: 0 }, input)).toThrow("MODEL_METADATA_CHANGED");
  });
});
