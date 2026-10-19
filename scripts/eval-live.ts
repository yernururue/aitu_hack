import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { BudgetGuard, type BudgetSnapshot } from "../src/lib/ai/budget";
import { nanoUsd, readAiConfig, validUsd } from "../src/lib/ai/config";
import { createChatJson, ChatJsonError, type ChatAttemptEvent, type ChatJson, type ChatJsonRequest } from "../src/lib/ai/openrouter";
import { parseTokenPrice, quoteRequest } from "../src/lib/ai/pricing";
import { explain } from "../src/lib/ai/explain";
import { ExplanationSchema } from "../src/lib/ai/validate";
import { CatalogSchema, type Catalog } from "../src/lib/contracts/poi";
import { IntentSchema, RecommendRequestSchema, type Intent } from "../src/lib/contracts/request";
import { canonicalDatasetHash } from "../src/lib/search/index";
import { parseIntent } from "../src/lib/search/intent";
import { retrieveWithMetadata } from "../src/lib/search/retrieve";
import type { RankedPoi } from "../src/lib/search/rank";
import { protectArtifactPaths } from "./build-index";

export const DEFAULT_EVAL_MODELS = Object.freeze(["openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "qwen/qwen3.8-flash"]);
export const LIVE_PROMPT_VERSION = "m3-core-strict-v1";
const CONTEXT_POLICY = "fixed_UI_filters_only; raw_query_unchanged; no_gold_in_retrieval; explanation_independent_of_model_intent";
const CaseSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), now: z.iso.datetime({ offset: true }), request: RecommendRequestSchema,
  expected: z.object({ relevantIds: z.array(z.string()), intent: IntentSchema.optional(), status: z.array(z.string()).min(1).optional() }),
});
type EvalCase = z.infer<typeof CaseSchema>;
export type FrozenLiveCase = Readonly<{
  item: EvalCase; fixedIntent: Intent; candidates: readonly RankedPoi[];
  contextHash: string; datasetHash: string; retrievalMode: string;
}>;
export type LiveEvalRow = {
  type: "measurement"; caseId: string; model: string; stage: ChatJsonRequest["stage"];
  promptVersion: string; promptHash: string | null; contextHash: string; datasetHash: string;
  candidateIds: string[]; expectedIds: string[]; actualIds: string[];
  schemaPass: boolean | null; groundingPass: boolean | null; intentMatch: boolean | null;
  abstained: boolean; abstentionPass: boolean | null; skipped: boolean;
  latencyMs: number; ttftMs: null; provider: string | null; responseModel: string | null;
  usage: ChatAttemptEvent["usage"]; costUsd: number | null; attemptCount: number;
  attempts: ChatAttemptEvent[]; errorCode: string | null;
};
export type LiveEvalResult = {
  type: "summary"; status: "disabled" | "blocked" | "complete"; reason: string | null;
  comparisonComplete: boolean; winner: null; diagnostic: boolean; models: readonly string[];
  synthetic: boolean | null;
  promptVersion: string; contextPolicy: string; latencyMs: number; ttftMs: null; rows: LiveEvalRow[];
};
export type LiveEvalOptions = {
  execute?: boolean; env?: Record<string, string | undefined>; models?: readonly string[];
  input?: { catalog: Catalog; cases: readonly unknown[] }; outputPath?: string;
};
export type LiveEvalDependencies = {
  snapshot?: () => Promise<BudgetSnapshot>;
  retrieve?: typeof retrieveWithMetadata;
  verifyModels?: (models: readonly string[]) => Promise<void>;
  createChat?: (options: { model: string; onAttempt: (event: ChatAttemptEvent) => void }) => ChatJson;
  writeReport?: (records: readonly unknown[], path: string) => Promise<void>;
};
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function immutable<T>(value: T): T {
  const copy: T = structuredClone(value);
  const freeze = (child: unknown) => { if (child && typeof child === "object") { Object.values(child).forEach(freeze); Object.freeze(child); } };
  freeze(copy); return copy;
}

/** Only raw query and UI constraints enter ranking. Gold labels remain scoring-only. */
export async function freezeLiveCases(catalog: Catalog, cases: readonly unknown[], retrieve = retrieveWithMetadata): Promise<FrozenLiveCase[]> {
  const source = immutable(CatalogSchema.parse(catalog));
  const datasetHash = canonicalDatasetHash(source);
  const rows: FrozenLiveCase[] = [];
  const ids = new Set<string>();
  for (const raw of cases) {
    const item = immutable(CaseSchema.parse(raw));
    if (ids.has(item.id)) throw new Error("INVALID_CASES"); ids.add(item.id);
    const fixedIntent = immutable(IntentSchema.parse({ ...item.request.filters, requiredFacts: [], preferredTags: [], conflict: null }));
    const result = await retrieve(item.request, fixedIntent, new Date(item.now), { catalog: source });
    if (result.dataSnapshot !== datasetHash || result.candidates.length > 8 || new Set(result.candidates.map((candidate) => candidate.poi.id)).size !== result.candidates.length) throw new Error("INVALID_FROZEN_CONTEXT");
    const catalogIds = new Set(source.places.map((poi) => poi.id));
    if (result.candidates.some((candidate) => !catalogIds.has(candidate.poi.id))) throw new Error("INVALID_FROZEN_CONTEXT");
    const candidates = immutable(result.candidates);
    rows.push(Object.freeze({ item, fixedIntent, candidates, datasetHash, retrievalMode: result.mode,
      contextHash: hash({ datasetHash, candidates, fixedIntent, query: item.request.query, locale: item.request.locale, policy: CONTEXT_POLICY }) }));
  }
  if (!rows.length) throw new Error("INVALID_CASES");
  return rows;
}

async function safeReportPath(path: string): Promise<string> {
  const root = resolve("evals/results"); const target = resolve(path);
  const child = relative(root, target);
  if (!child || child.startsWith("..") || isAbsolute(child) || !target.endsWith(".jsonl")) throw new Error("UNSAFE_REPORT_PATH");
  const paths = await protectArtifactPaths(["evals/real-cases.json", "data/catalog/places.json"], [root, target]);
  const expectedRoot = resolve(await realpath(process.cwd()), "evals/results");
  const canonicalChild = relative(expectedRoot, paths.outputs[1]);
  if (paths.outputs[0] !== expectedRoot || !canonicalChild || canonicalChild.startsWith("..") || isAbsolute(canonicalChild)) throw new Error("UNSAFE_REPORT_PATH");
  return paths.outputs[1];
}

/** A single final atomic write. A write failure must never replay provider calls. */
export async function writeLiveReport(path: string, records: readonly unknown[]): Promise<void> {
  const output = await safeReportPath(path);
  const content = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(content, "utf8"); await file.sync(); } finally { await file.close(); }
    await rename(temporary, output);
    const directory = await open(dirname(output), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(temporary, { force: true }); }
}

// Public metadata only, with no credentials. Never reached in disabled mode or
// when the whole model set is already impossible under the immutable quotes.
async function verifyCurrentModels(models: readonly string[]): Promise<void> {
  const response = await fetch("https://openrouter.ai/api/v1/models", { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("MODEL_METADATA_UNAVAILABLE");
  const body: unknown = await response.json();
  const PriceSchema = z.object({ prompt: z.string(), completion: z.string() }).catchall(z.unknown());
  const ModelSchema = z.object({ id: z.string(), context_length: z.number().int().positive(), pricing: PriceSchema,
    supported_parameters: z.array(z.string()), top_provider: z.object({ max_completion_tokens: z.number().int().positive() }) });
  const { data } = z.object({ data: z.array(z.unknown()) }).parse(body);
  for (const id of models) {
    const matches = data.filter((item) => item && typeof item === "object" && "id" in item && item.id === id);
    if (matches.length !== 1) throw new Error("MODEL_METADATA_UNAVAILABLE");
    const item = ModelSchema.parse(matches[0]);
    const quote = quoteRequest({ operation: "explanation", model: id, maxCompletionTokens: 1000 });
    if (!["structured_outputs", "response_format", quote.outputParameter].every((parameter) => item.supported_parameters.includes(parameter)) || item.context_length > quote.contextLength || item.context_length < 1000 || item.top_provider.max_completion_tokens < 1000) throw new Error("MODEL_METADATA_CHANGED");
    const tiers = [item.pricing, ...z.array(PriceSchema).parse(item.pricing.overrides ?? [])];
    let inputRate = 0; let outputRate = 0;
    for (const price of tiers) {
      const prompt = Number(quote.provider.max_price.prompt) / 1e6;
      const completion = Number(quote.provider.max_price.completion) / 1e6;
      if (parseTokenPrice(price.prompt) > prompt || parseTokenPrice(price.completion) > completion) throw new Error("MODEL_METADATA_CHANGED");
      inputRate = Math.max(inputRate, parseTokenPrice(price.prompt));
      outputRate = Math.max(outputRate, parseTokenPrice(price.completion));
      for (const key of ["input_cache_read", "input_cache_write", "input_cache_write_1h"]) {
        if (price[key] !== undefined) inputRate = Math.max(inputRate, parseTokenPrice(price[key]));
      }
    }
    // Recheck the same full-context/full-output bound; neither a cache tier nor
    // an increased output ceiling may borrow slack from the other component.
    if (nanoUsd(item.context_length * inputRate + item.top_provider.max_completion_tokens * outputRate) > nanoUsd(quote.estimatedUsd)) throw new Error("MODEL_METADATA_CHANGED");
  }
}

async function loadFrozenInput(): Promise<{ catalog: Catalog; cases: unknown[] }> {
  const [catalogText, labelText] = await Promise.all([readFile("data/catalog/places.json", "utf8"), readFile("evals/real-cases.json", "utf8")]);
  const labels = z.object({ synthetic: z.literal(false), metadata: z.object({ catalogSha256: z.string() }), cases: z.array(z.unknown()) }).parse(JSON.parse(labelText));
  if (createHash("sha256").update(catalogText).digest("hex") !== labels.metadata.catalogSha256) throw new Error("FROZEN_CATALOG_MISMATCH");
  const catalog = CatalogSchema.parse(JSON.parse(catalogText));
  if (catalog.synthetic) throw new Error("REAL_CATALOG_REQUIRED");
  return { catalog, cases: labels.cases };
}

function totalUsage(attempts: readonly ChatAttemptEvent[]): ChatAttemptEvent["usage"] {
  const sum = (key: keyof ChatAttemptEvent["usage"]) => attempts.length && attempts.every((item) => item.usage[key] !== null)
    ? attempts.reduce((total, item) => total + item.usage[key]!, 0) : null;
  return { promptTokens: sum("promptTokens"), completionTokens: sum("completionTokens"), totalTokens: sum("totalTokens") };
}
function sameIntent(left: Intent, right: Intent): boolean {
  const normalized = (intent: Intent) => ({ ...intent, categories: [...intent.categories].sort(), requiredFacts: [...intent.requiredFacts].sort(), preferredTags: [...intent.preferredTags].sort() });
  return hash(normalized(left)) === hash(normalized(right));
}

export async function runLiveEvaluation(options: LiveEvalOptions = {}, dependencies: LiveEvalDependencies = {}): Promise<LiveEvalResult> {
  const started = performance.now(); const models = [...(options.models ?? DEFAULT_EVAL_MODELS)];
  const result: LiveEvalResult = { type: "summary", status: "disabled", reason: null, comparisonComplete: false, winner: null,
    diagnostic: true, models, synthetic: null, promptVersion: LIVE_PROMPT_VERSION, contextPolicy: CONTEXT_POLICY, latencyMs: 0, ttftMs: null, rows: [] };
  const finish = () => { result.latencyMs = Math.max(0, performance.now() - started); return result; };
  const block = (reason: string) => { result.status = "blocked"; result.reason = reason; return finish(); };
  if (!options.execute) return finish();
  let config: ReturnType<typeof readAiConfig>;
  try { config = readAiConfig(options.env); } catch { return block("INVALID_AI_CONFIGURATION"); }
  if (!config.paidEnabled || !config.liveEvalEnabled) return block("LIVE_EVAL_DISABLED");
  if (!models.length || new Set(models).size !== models.length || models.some((model) => !DEFAULT_EVAL_MODELS.includes(model))) return block("INVALID_MODEL_SET");
  result.diagnostic = models.length !== DEFAULT_EVAL_MODELS.length;
  const estimates = new Map(models.map((model) => [model, quoteRequest({ operation: "explanation", model, maxCompletionTokens: 1000 }).estimatedUsd]));
  if ([...estimates.values()].some((cost) => cost > config.caps.live_eval || cost > config.caps.prep)) return block("MODEL_QUOTE_EXCEEDS_CAP");
  const snapshot = dependencies.snapshot ?? (() => new BudgetGuard({ path: config.ledgerPath, caps: config.caps }).snapshot());
  const checkBudget = async (cost: number): Promise<string | null> => {
    try {
      const state = await snapshot();
      if (state.uncertain) return "COST_UNKNOWN";
      if (![state.available.prep, state.available.live_eval].every((amount) => validUsd(amount) && amount >= cost)) return "BUDGET_UNAVAILABLE";
      return null;
    } catch { return "BUDGET_UNAVAILABLE"; }
  };
  const batchFailure = await checkBudget(Math.max(...estimates.values()));
  if (batchFailure) return block(batchFailure);
  const outputPath = options.outputPath ?? "evals/results/live-eval.jsonl";
  let cases: FrozenLiveCase[];
  try {
    await safeReportPath(outputPath);
    await protectArtifactPaths([config.ledgerPath], [outputPath]);
    await (dependencies.verifyModels ?? verifyCurrentModels)(models);
    const input = options.input ?? await loadFrozenInput();
    cases = await freezeLiveCases(input.catalog, input.cases, dependencies.retrieve);
    result.synthetic = input.catalog.synthetic;
  } catch { return block("PREFLIGHT_FAILED"); }
  result.status = "complete";
  outer: for (const frozen of cases) {
    for (const model of models) {
      const batchError = await checkBudget(estimates.get(model)!);
      if (batchError) { block(batchError); break outer; }
      // Intent and explanation share one case/model deadline. Each ChatJson
      // attempt independently reserves and settles inside the accepted transport.
      const deadlineAt = Date.now() + 25_000;
      for (const stage of ["intent", "explanation"] as const) {
        const budgetError = await checkBudget(estimates.get(model)!);
        if (budgetError) { block(budgetError); break outer; }
        const attempts: ChatAttemptEvent[] = [];
        let raw: unknown; let promptHash: string | null = null; let failure: unknown; let corePassed = false;
        let intentResult: Intent | undefined;
        const stageStart = performance.now();
        try {
          const provider = (dependencies.createChat ?? createChatJson)({ model, onAttempt: (event) => { attempts.push(event); } });
          const chatJson: ChatJson = async (request) => {
            promptHash = hash({ stage: request.stage, messages: request.messages, jsonSchema: request.jsonSchema });
            try { raw = await provider(request); return raw; } catch (error) { failure = error; throw error; }
          };
          if (stage === "intent") {
            intentResult = await parseIntent(frozen.item.request.query, frozen.item.request.filters, frozen.item.request.explicitFilterKeys, { mode: "live", chatJson, deadlineAt, purpose: "live_eval" });
            corePassed = IntentSchema.safeParse(raw).success;
          } else {
            await explain(frozen.candidates, frozen.fixedIntent, { query: frozen.item.request.query, locale: frozen.item.request.locale, chatJson, deadlineAt, purpose: "live_eval" });
            corePassed = true;
          }
        } catch (error) { failure = error; }
        const skipped = promptHash === null;
        const schema = stage === "intent" ? IntentSchema.safeParse(raw) : ExplanationSchema.safeParse(raw);
        const actualIds = stage === "explanation" && schema.success && "items" in schema.data ? schema.data.items.map((item) => item.poiId) : [];
        const abstained = stage === "intent" ? intentResult?.conflict !== null : actualIds.length === 0;
        const costKnown = attempts.every((event) => event.costKnown && validUsd(event.costUsd));
        const costUsd = costKnown && (attempts.length > 0 || skipped) ? attempts.reduce((sum, event) => sum + nanoUsd(event.costUsd!), 0) / 1e9 : null;
        const unique = (key: "provider" | "responseModel") => { const values = new Set(attempts.map((event) => event[key])); return values.size === 1 ? [...values][0] : null; };
        // No filtered matches does not imply an ambiguous intent. Score each
        // stage against its own labels; missing intent labels stay unscored.
        const expectedAbstention = stage === "intent"
          ? frozen.item.expected.intent ? frozen.item.expected.intent.conflict !== null : undefined
          : frozen.item.expected.status?.every((status) => ["clarify", "no_results"].includes(status));
        const row: LiveEvalRow = {
          type: "measurement", caseId: frozen.item.id, model, stage, promptVersion: LIVE_PROMPT_VERSION, promptHash,
          contextHash: frozen.contextHash, datasetHash: frozen.datasetHash, candidateIds: frozen.candidates.map((candidate) => candidate.poi.id),
          expectedIds: frozen.item.expected.relevantIds, actualIds, schemaPass: skipped ? null : schema.success,
          groundingPass: stage === "explanation" && !skipped ? corePassed : null,
          intentMatch: stage === "intent" && schema.success && frozen.item.expected.intent && intentResult ? sameIntent(intentResult, frozen.item.expected.intent) : null,
          abstained, abstentionPass: expectedAbstention === undefined ? null : abstained === expectedAbstention, skipped,
          latencyMs: Math.max(0, performance.now() - stageStart), ttftMs: null, provider: unique("provider"), responseModel: unique("responseModel"),
          usage: totalUsage(attempts), costUsd, attemptCount: attempts.length, attempts,
          errorCode: failure instanceof ChatJsonError ? failure.code : failure ? "STAGE_VALIDATION_FAILED" : null,
        };
        result.rows.push(row);
        if (costUsd === null) { block(attempts.some((event) => !event.costKnown) || failure instanceof ChatJsonError && !failure.costKnown ? "COST_UNKNOWN" : "METRICS_UNAVAILABLE"); break outer; }
        const after = await checkBudget(0);
        if (after) { block(after); break outer; }
      }
    }
  }
  result.comparisonComplete = result.status === "complete" && !result.diagnostic;
  finish();
  try {
    const { rows, ...metadata } = result;
    const records = [{ ...metadata, type: "metadata" }, ...rows];
    await (dependencies.writeReport ?? ((records, path) => writeLiveReport(path, records)))(records, outputPath);
  } catch { block("REPORT_WRITE_FAILED"); result.comparisonComplete = false; }
  return finish();
}

export async function main(args: string[]): Promise<number> {
  // CLI deliberately offers no subset/model/provider/HTTP override. A diagnostic
  // subset is an explicit injected API operation, never a three-model winner.
  if (args.some((arg) => arg !== "--execute") || args.length > 1) { console.info(JSON.stringify({ status: "blocked", reason: "INVALID_ARGUMENTS", comparisonComplete: false, winner: null })); return 1; }
  const result = await runLiveEvaluation({ execute: args.includes("--execute") });
  const { rows, ...summary } = result;
  console.info(JSON.stringify({ ...summary, rowCount: rows.length }));
  return result.status === "blocked" ? 1 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
