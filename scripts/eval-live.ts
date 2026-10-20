import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { BudgetGuard, type BudgetSnapshot } from "../src/lib/ai/budget";
import { nanoUsd, readAiConfig, validUsd } from "../src/lib/ai/config";
import { createChatJson, ChatJsonError, type ChatAttemptEvent, type ChatJson, type ChatJsonRequest } from "../src/lib/ai/openrouter";
import { verifyQuoteMetadata } from "../src/lib/ai/metadata";
import { quoteRequest, type Quote } from "../src/lib/ai/pricing";
import { explain } from "../src/lib/ai/explain";
import { ExplanationSchema, type GeneratedItems } from "../src/lib/ai/validate";
import { CatalogSchema, type Catalog } from "../src/lib/contracts/poi";
import { IntentSchema, RecommendRequestSchema, type Intent } from "../src/lib/contracts/request";
import { canonicalDatasetHash, DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL, rawQueryHash, validateIndex, validateQueryCache } from "../src/lib/search/index";
import { deriveOriginContext, parseIntent } from "../src/lib/search/intent";
import { retrieveWithMetadata } from "../src/lib/search/retrieve";
import type { RankedPoi } from "../src/lib/search/rank";
import { protectArtifactPaths } from "./build-index";

export const DEFAULT_EVAL_MODELS = Object.freeze(["openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "qwen/qwen3.8-flash"]);
export const AMENDED_EVAL_PROTOCOL = "approved-luna-qwen-20261020";
export const AMENDED_EVAL_MODELS = Object.freeze(["openai/gpt-6-luna", "qwen/qwen3.8-flash"]);
export const QWEN_EVAL_PROTOCOL = "approved-qwen-20261020";
export const QWEN_EVAL_MODELS = Object.freeze(["qwen/qwen3.8-flash"]);
type EvalProtocol = "original-three-model" | typeof AMENDED_EVAL_PROTOCOL | typeof QWEN_EVAL_PROTOCOL;
const AMENDMENT_AUTHORIZATION = Object.freeze({ authorizationId: "87921423-9345-419a-bd47-c90f0e8b0c38",
  grantRef: "call_082bf0991a884dbdab84f204cf7058ce", approvedAt: "2026-10-20T14:19:34.395565+00:00" });
const QWEN_AUTHORIZATION = Object.freeze({ authorizationId: "00d1c10d-26b9-4daf-8107-964a5375bb67",
  grantRef: "call_dd3ce7d726fb4aebb4d0fe1b10a88e9e", approvedAt: "2026-10-20T14:49:53.969679+00:00" });
const QUALITY_REQUIREMENTS = Object.freeze({ positiveCasesPerModel: 12, minimumValidPositivesPerModel: 10,
  idEvidenceHardFilterPassRate: 1, unsupportedFacts: 0, separateNegativeGuards: 4 });
export const LIVE_PROMPT_VERSION = "m3-core-strict-origin-context-v2";
const CONTEXT_POLICY = "fixed_UI_filters_and_trusted_selected_origin; raw_query_unchanged; no_gold_in_retrieval; explanation_independent_of_model_intent";
export const INTENT_SCORING_POLICY = "hard-fields-v1; preferredTags-human-review";
const CaseSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), now: z.iso.datetime({ offset: true }), request: RecommendRequestSchema,
  intentScoringPolicy: z.enum(["exact-v1", INTENT_SCORING_POLICY]).default("exact-v1"),
  unscoredSemanticRequirements: z.array(z.string().min(1)).default([]),
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
  retrievalMode: string; validatedIntent: Intent | null; validatedItems: GeneratedItems | null;
  evidenceSources: { poiId: string; sources: Catalog["places"][number]["sources"] }[];
  intentScore: IntentScore | null; validatedRelevantTop3: boolean | null;
  schemaPass: boolean | null; groundingPass: boolean | null; intentMatch: boolean | null;
  abstained: boolean; abstentionPass: boolean | null; skipped: boolean;
  latencyMs: number; ttftMs: null; provider: string | null; responseModel: string | null;
  usage: ChatAttemptEvent["usage"]; costUsd: number | null; attemptCount: number;
  attempts: ChatAttemptEvent[]; errorCode: string | null;
};
type ModelDisposition = { model: string; provider?: "Azure"; reason?: "current_15s_single_attempt_timeout";
  status: "measured" | "partially_measured" | "not_assessed" | "technically_disqualified";
  remainingCases: "none" | "not_assessed"; qualityAssessment: null;
  observations?: { status: number | null; costKnown: false }[] };
export type LiveEvalResult = {
  type: "summary"; status: "disabled" | "blocked" | "complete"; reason: string | null;
  comparisonComplete: boolean; originalFullThreeModelComparisonComplete: boolean; amendedComparisonComplete: boolean; qwenQualificationComplete: boolean;
  protocol: EvalProtocol; protocolAuthorization: typeof AMENDMENT_AUTHORIZATION | typeof QWEN_AUTHORIZATION | null;
  modelDispositions: ModelDisposition[]; qualityRequirements: typeof QUALITY_REQUIREMENTS;
  winner: null; diagnostic: boolean; models: readonly string[];
  synthetic: boolean | null; intentScoringPolicy: string; annotationHash: string | null;
  inputHashes: Readonly<Record<string, string>> | null; humanReviewRequired: true;
  schemaProjectionPolicy: string; reserveQuotes: readonly Quote[];
  promptVersion: string; contextPolicy: string; latencyMs: number; ttftMs: null; rows: LiveEvalRow[];
};
export type LiveEvalOptions = {
  execute?: boolean; env?: Record<string, string | undefined>; models?: readonly string[]; protocol?: EvalProtocol;
  input?: LiveInput; outputPath?: string;
};
type LiveInput = { catalog: Catalog; cases: readonly unknown[]; requireSemantic?: boolean;
  retrieve?: typeof retrieveWithMetadata; annotationHash?: string; inputHashes?: Readonly<Record<string, string>> };
type IntentScore = { policy: string; hardFieldsPass: boolean; requiredFactsPass: boolean; conflictPass: boolean;
  preferredTags: "exact" | "human-review"; unscoredSemanticRequirements: string[] };
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
      contextHash: hash({ datasetHash, candidates, fixedIntent, query: item.request.query, locale: item.request.locale, originContext: deriveOriginContext(item.request.location), policy: CONTEXT_POLICY }) }));
  }
  if (!rows.length) throw new Error("INVALID_CASES");
  return rows;
}

async function safeReportPath(path: string): Promise<string> {
  const root = resolve("evals/results"); const target = resolve(path);
  const child = relative(root, target);
  if (!child || child.startsWith("..") || isAbsolute(child) || !target.endsWith(".jsonl")) throw new Error("UNSAFE_REPORT_PATH");
  const paths = await protectArtifactPaths(["evals/real-cases.json", "evals/live-intent-expectations.json", "data/catalog/places.json", "data/index/places.json", "data/index/query-vectors.json"], [root, target]);
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
  const get = async (url: string): Promise<unknown> => {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("MODEL_METADATA_UNAVAILABLE");
    return response.json();
  };
  const [body, endpoints] = await Promise.all([
    get("https://openrouter.ai/api/v1/models"),
    Promise.all(models.map((model) => get(`https://openrouter.ai/api/v1/models/${model}/endpoints`))),
  ]);
  const { data } = z.object({ data: z.array(z.unknown()) }).parse(body);
  models.forEach((model, i) => {
    const matches = data.filter((item) => item && typeof item === "object" && "id" in item && item.id === model);
    if (matches.length !== 1) throw new Error("MODEL_METADATA_UNAVAILABLE");
    verifyQuoteMetadata(quoteRequest({ operation: "explanation", model, maxCompletionTokens: 1000 }), { model: matches[0], endpoints: endpoints[i] });
  });
}

const AnnotationSchema = z.object({
  schemaVersion: z.literal("1.0"), labelsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  catalogSha256: z.string().regex(/^[a-f0-9]{64}$/), datasetHash: z.string().regex(/^[a-f0-9]{64}$/),
  intentScoringPolicy: z.literal(INTENT_SCORING_POLICY),
  cases: z.array(z.object({ id: z.string(), rawQueryHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedIntent: IntentSchema, unscoredSemanticRequirements: z.array(z.string().min(1)) })).min(1),
});

/** Source annotations affect scoring only; never pass them to retrieval or prompts. */
export function attachIntentExpectations(cases: readonly unknown[], rawAnnotations: unknown): EvalCase[] {
  const annotations = AnnotationSchema.parse(rawAnnotations);
  const indexed = new Map(annotations.cases.map((item) => [item.id, item]));
  const parsed = cases.map((item) => CaseSchema.parse(item));
  if (indexed.size !== annotations.cases.length || indexed.size !== parsed.length || new Set(parsed.map((item) => item.id)).size !== parsed.length) throw new Error("INTENT_LABELS_INCOMPLETE");
  return parsed.map((item) => {
    const annotation = indexed.get(item.id);
    if (!annotation) throw new Error("INTENT_LABELS_INCOMPLETE");
    if (annotation.rawQueryHash !== rawQueryHash(item.request.query)) throw new Error("INTENT_QUERY_MISMATCH");
    return CaseSchema.parse({ ...item, intentScoringPolicy: annotations.intentScoringPolicy,
      unscoredSemanticRequirements: annotation.unscoredSemanticRequirements,
      expected: { ...item.expected, intent: annotation.expectedIntent } });
  });
}

/** Offline only. Missing or incompatible vectors fail instead of creating a live embedder. */
export function createCachedSemanticRetriever(catalog: Catalog, rawIndex: unknown, rawCache: unknown, expected: { model: string; dimensions: number }): typeof retrieveWithMetadata {
  const source = immutable(CatalogSchema.parse(catalog));
  const index = immutable(validateIndex(rawIndex, source, expected));
  const cache = immutable(validateQueryCache(rawCache, source, expected));
  return async (request, intent, now) => {
    const queryVector = cache.queries[rawQueryHash(request.query)];
    if (!queryVector) throw new Error("QUERY_CACHE_MISS");
    return retrieveWithMetadata(request, intent, now, { catalog: source, index,
      embeddingModel: expected.model, embeddingDimensions: expected.dimensions, queryVector: [...queryVector] });
  };
}

// Accepted Task 2 artifacts. A changed snapshot needs a new reviewed freeze.
const FROZEN_HASHES = Object.freeze({
  catalogSha256: "c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873",
  labelsSha256: "73947dd92e4b33641897321e6832ef0dad463dbe33baee4512e8be2efc5cee36",
  datasetHash: "4677a7a004ef0626f4b911814a8f3b825f81e61ab8b03f82cb00d977fe6950a6",
  indexSha256: "568c855ff30dc866c8de4f0eed3038df4406898bd45fe25472f5afa318934d45",
  queryCacheSha256: "2788286068ef9d7d45e00ead9cf30c18de7ca6258acd939cc07c89e6b0cc38eb",
});
export async function loadFrozenLiveInput(): Promise<LiveInput> {
  const [catalogText, labelText, annotationText, indexText, queryText] = await Promise.all([
    readFile("data/catalog/places.json", "utf8"), readFile("evals/real-cases.json", "utf8"),
    readFile("evals/live-intent-expectations.json", "utf8"), readFile("data/index/places.json", "utf8"), readFile("data/index/query-vectors.json", "utf8"),
  ]);
  const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
  const inputHashes = { catalogSha256: sha(catalogText), labelsSha256: sha(labelText), indexSha256: sha(indexText), queryCacheSha256: sha(queryText) };
  if (Object.entries(inputHashes).some(([key, value]) => value !== FROZEN_HASHES[key as keyof typeof inputHashes])) throw new Error("FROZEN_INPUT_MISMATCH");
  const labels = z.object({ synthetic: z.literal(false), metadata: z.object({ catalogSha256: z.string() }),
    cases: z.array(z.object({ kind: z.enum(["retrieval_positive", "negative_guard"]), countInPositiveMetrics: z.boolean() }).passthrough()) }).parse(JSON.parse(labelText));
  const annotations = AnnotationSchema.parse(JSON.parse(annotationText));
  const catalog = CatalogSchema.parse(JSON.parse(catalogText));
  if (catalog.synthetic || catalog.places.length !== 298 || canonicalDatasetHash(catalog) !== FROZEN_HASHES.datasetHash
    || labels.metadata.catalogSha256 !== inputHashes.catalogSha256 || annotations.catalogSha256 !== inputHashes.catalogSha256
    || annotations.labelsSha256 !== inputHashes.labelsSha256 || annotations.datasetHash !== FROZEN_HASHES.datasetHash) throw new Error("FROZEN_INPUT_MISMATCH");
  const positives = labels.cases.filter((item) => item.kind === "retrieval_positive" && item.countInPositiveMetrics);
  if (positives.length !== 12 || labels.cases.filter((item) => item.kind === "negative_guard" && !item.countInPositiveMetrics).length !== 4) throw new Error("INVALID_CASES");
  const cases = attachIntentExpectations(positives, annotations);
  const retrieve = createCachedSemanticRetriever(catalog, JSON.parse(indexText), JSON.parse(queryText), { model: DEFAULT_EMBEDDING_MODEL, dimensions: DEFAULT_EMBEDDING_DIMENSIONS });
  return { catalog, cases, requireSemantic: true, retrieve, annotationHash: sha(annotationText), inputHashes };
}

/** The amendment changes the measured models, never the frozen queries, labels or
 * cached context inputs. Negative guards stay in the authoritative retrieval run. */
async function assertApprovedInput(input: LiveInput, cases: readonly FrozenLiveCase[]): Promise<void> {
  const [labelText, annotationText] = await Promise.all([
    readFile("evals/real-cases.json", "utf8"), readFile("evals/live-intent-expectations.json", "utf8"),
  ]);
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  if (sha(labelText) !== FROZEN_HASHES.labelsSha256 || input.annotationHash !== sha(annotationText)
    || input.catalog.synthetic || canonicalDatasetHash(input.catalog) !== FROZEN_HASHES.datasetHash
    || !input.requireSemantic || !input.inputHashes
    || ["catalogSha256", "labelsSha256", "indexSha256", "queryCacheSha256"].some((key) => input.inputHashes![key] !== FROZEN_HASHES[key as keyof typeof FROZEN_HASHES])) throw new Error("AMENDED_INPUT_MISMATCH");
  const labels = z.object({ synthetic: z.literal(false), cases: z.array(z.object({
    kind: z.enum(["retrieval_positive", "negative_guard"]), countInPositiveMetrics: z.boolean(),
  }).passthrough()) }).parse(JSON.parse(labelText));
  const positives = labels.cases.filter((item) => item.kind === "retrieval_positive" && item.countInPositiveMetrics);
  const expected = attachIntentExpectations(positives, JSON.parse(annotationText));
  if (expected.length !== 12 || labels.cases.filter((item) => item.kind === "negative_guard" && !item.countInPositiveMetrics).length !== 4
    || cases.length !== 12 || hash(cases.map((item) => item.item)) !== hash(expected)
    || cases.some((item) => item.retrievalMode !== "semantic" || !item.candidates.length)) throw new Error("AMENDED_INPUT_MISMATCH");
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

function scoreIntent(actual: Intent, expected: Intent, item: EvalCase): { match: boolean; details: IntentScore } {
  const sorted = (values: readonly string[]) => [...values].sort();
  const fields = (intent: Intent) => ({ categories: sorted(intent.categories), radiusM: intent.radiusM,
    durationMinutes: intent.durationMinutes, company: intent.company, maxSpendKzt: intent.maxSpendKzt, openNow: intent.openNow });
  const details: IntentScore = { policy: item.intentScoringPolicy,
    hardFieldsPass: hash(fields(actual)) === hash(fields(expected)),
    requiredFactsPass: hash(sorted(actual.requiredFacts)) === hash(sorted(expected.requiredFacts)),
    conflictPass: (actual.conflict === null) === (expected.conflict === null),
    preferredTags: item.intentScoringPolicy === INTENT_SCORING_POLICY ? "human-review" : "exact",
    unscoredSemanticRequirements: item.unscoredSemanticRequirements };
  return { details, match: item.intentScoringPolicy === INTENT_SCORING_POLICY
    ? details.hardFieldsPass && details.requiredFactsPass && details.conflictPass : sameIntent(actual, expected) };
}

export async function runLiveEvaluation(options: LiveEvalOptions = {}, dependencies: LiveEvalDependencies = {}): Promise<LiveEvalResult> {
  const started = performance.now(); const protocol = options.protocol ?? "original-three-model";
  const amended = protocol === AMENDED_EVAL_PROTOCOL;
  const qwenQualification = protocol === QWEN_EVAL_PROTOCOL;
  const approvedProtocol = amended || qwenQualification;
  const expectedModels = amended ? AMENDED_EVAL_MODELS : qwenQualification ? QWEN_EVAL_MODELS : DEFAULT_EVAL_MODELS;
  const models = [...(options.models ?? expectedModels)];
  const result: LiveEvalResult = { type: "summary", status: "disabled", reason: null, comparisonComplete: false,
    originalFullThreeModelComparisonComplete: false, amendedComparisonComplete: false, qwenQualificationComplete: false, protocol,
    protocolAuthorization: amended ? AMENDMENT_AUTHORIZATION : qwenQualification ? QWEN_AUTHORIZATION : null, qualityRequirements: QUALITY_REQUIREMENTS,
    modelDispositions: DEFAULT_EVAL_MODELS.map((model): ModelDisposition => approvedProtocol && model === "anthropic/claude-haiku-5.5"
      ? { model, provider: "Azure", status: "technically_disqualified", remainingCases: "not_assessed", qualityAssessment: null,
        observations: [{ status: null, costKnown: false }, { status: 400, costKnown: false }] }
      : qwenQualification && model === "openai/gpt-6-luna"
        ? { model, status: "technically_disqualified", reason: "current_15s_single_attempt_timeout",
          remainingCases: "not_assessed", qualityAssessment: null, observations: [{ status: null, costKnown: false }] }
        : { model, status: "not_assessed", remainingCases: "not_assessed", qualityAssessment: null }), winner: null,
    diagnostic: true, models, synthetic: null, intentScoringPolicy: "injected-exact-v1", annotationHash: null, inputHashes: null, humanReviewRequired: true,
    reserveQuotes: [], schemaProjectionPolicy: "original-core-schema-hash; Haiku anthropic-bounds-v1 wire only; strict local validation unchanged", promptVersion: LIVE_PROMPT_VERSION, contextPolicy: CONTEXT_POLICY, latencyMs: 0, ttftMs: null, rows: [] };
  const finish = () => {
    for (const disposition of result.modelDispositions) {
      if (disposition.status === "technically_disqualified") continue;
      const measured = new Set(result.rows.filter((row) => row.model === disposition.model && !row.skipped)
        .map((row) => `${row.caseId}:${row.stage}`)).size;
      disposition.status = measured >= 24 ? "measured" : measured ? "partially_measured" : "not_assessed";
      disposition.remainingCases = measured >= 24 ? "none" : "not_assessed";
    }
    result.latencyMs = Math.max(0, performance.now() - started); return result;
  };
  const block = (reason: string) => { result.status = "blocked"; result.reason = reason; return finish(); };
  if (protocol !== "original-three-model" && !approvedProtocol) return block("INVALID_PROTOCOL");
  if (!options.execute) return finish();
  let config: ReturnType<typeof readAiConfig>;
  try { config = readAiConfig(options.env); } catch { return block("INVALID_AI_CONFIGURATION"); }
  if (!config.paidEnabled || !config.liveEvalEnabled) return block("LIVE_EVAL_DISABLED");
  if (!models.length || new Set(models).size !== models.length || models.some((model) => !DEFAULT_EVAL_MODELS.includes(model))) return block("INVALID_MODEL_SET");
  if (approvedProtocol && hash(models) !== hash(expectedModels)) return block("INVALID_PROTOCOL_MODEL_SET");
  result.diagnostic = approvedProtocol ? false : models.length !== DEFAULT_EVAL_MODELS.length;
  result.reserveQuotes = Object.freeze(models.map((model) => quoteRequest({ operation: "explanation", model, maxCompletionTokens: 1000 })));
  const estimates = new Map(result.reserveQuotes.map((quote) => [quote.model, quote.estimatedUsd]));
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
  const outputPath = options.outputPath ?? (qwenQualification ? "evals/results/live-eval-approved-qwen-20261020.jsonl" : amended ? "evals/results/live-eval-approved-luna-qwen-20261020.jsonl" : "evals/results/live-eval.jsonl");
  let cases: FrozenLiveCase[];
  try {
    await safeReportPath(outputPath);
    await protectArtifactPaths([config.ledgerPath], [outputPath]);
    await (dependencies.verifyModels ?? verifyCurrentModels)(models);
    const input = options.input ?? await loadFrozenLiveInput();
    cases = await freezeLiveCases(input.catalog, input.cases, dependencies.retrieve ?? input.retrieve);
    if (approvedProtocol) await assertApprovedInput(input, cases);
    if (input.requireSemantic && cases.some((item) => item.retrievalMode !== "semantic" || !item.item.expected.intent || !item.candidates.length)) throw new Error("SEMANTIC_PREFLIGHT_FAILED");
    result.synthetic = input.catalog.synthetic;
    result.annotationHash = input.annotationHash ?? null; result.inputHashes = input.inputHashes ?? null;
    result.intentScoringPolicy = cases.every((item) => item.item.intentScoringPolicy === INTENT_SCORING_POLICY) ? INTENT_SCORING_POLICY : "injected-exact-v1";
    result.diagnostic ||= input.catalog.synthetic || cases.length !== 12 || !input.requireSemantic || !input.annotationHash;
    if (cases.some((item) => !item.item.expected.intent)) result.diagnostic = true;
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
        let intentResult: Intent | undefined; let validatedItems: GeneratedItems | null = null;
        const stageStart = performance.now();
        try {
          const provider = (dependencies.createChat ?? createChatJson)({ model, onAttempt: (event) => { attempts.push(event); } });
          const chatJson: ChatJson = async (request) => {
            promptHash = hash({ stage: request.stage, messages: request.messages, jsonSchema: request.jsonSchema });
            try { raw = await provider(request); return raw; } catch (error) { failure = error; throw error; }
          };
          if (stage === "intent") {
            intentResult = await parseIntent(frozen.item.request.query, frozen.item.request.filters, frozen.item.request.explicitFilterKeys, { mode: "live", chatJson, deadlineAt, purpose: "live_eval", originContext: deriveOriginContext(frozen.item.request.location) });
            corePassed = IntentSchema.safeParse(raw).success;
          } else {
            validatedItems = await explain(frozen.candidates, frozen.fixedIntent, { query: frozen.item.request.query, locale: frozen.item.request.locale, chatJson, deadlineAt, purpose: "live_eval" });
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
        const intentScore = stage === "intent" && intentResult && frozen.item.expected.intent ? scoreIntent(intentResult, frozen.item.expected.intent, frozen.item) : null;
        const row: LiveEvalRow = {
          type: "measurement", caseId: frozen.item.id, model, stage, promptVersion: LIVE_PROMPT_VERSION, promptHash,
          contextHash: frozen.contextHash, datasetHash: frozen.datasetHash, candidateIds: frozen.candidates.map((candidate) => candidate.poi.id),
          expectedIds: frozen.item.expected.relevantIds, actualIds,
          retrievalMode: frozen.retrievalMode, validatedIntent: intentResult ?? null, validatedItems,
          evidenceSources: (validatedItems ?? []).map((item) => ({ poiId: item.poiId,
            sources: frozen.candidates.find((candidate) => candidate.poi.id === item.poiId)!.poi.sources.filter((source) => item.evidenceIds.includes(source.id)) })),
          intentScore: intentScore?.details ?? null,
          validatedRelevantTop3: stage === "explanation" ? validatedItems ? validatedItems.slice(0, 3).some((item) => frozen.item.expected.relevantIds.includes(item.poiId)) : false : null,
          schemaPass: skipped ? null : schema.success,
          groundingPass: stage === "explanation" && !skipped ? corePassed : null,
          intentMatch: intentScore ? schema.success && intentScore.match : null,
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
  const measuredComplete = result.status === "complete" && !result.diagnostic && result.rows.length === cases.length * models.length * 2 && result.rows.every((row) => !row.skipped && (row.stage !== "intent" || row.intentMatch !== null));
  // Completeness describes coverage only, never model quality or release approval.
  result.originalFullThreeModelComparisonComplete = !approvedProtocol && measuredComplete;
  result.comparisonComplete = result.originalFullThreeModelComparisonComplete;
  result.amendedComparisonComplete = amended && measuredComplete;
  result.qwenQualificationComplete = qwenQualification && measuredComplete;
  finish();
  try {
    const { rows, ...metadata } = result;
    const records = [{ ...metadata, type: "metadata" }, ...rows];
    await (dependencies.writeReport ?? ((records, path) => writeLiveReport(path, records)))(records, outputPath);
  } catch { block("REPORT_WRITE_FAILED"); result.comparisonComplete = false; result.originalFullThreeModelComparisonComplete = false; result.amendedComparisonComplete = false; result.qwenQualificationComplete = false; }
  return finish();
}

export async function main(args: string[]): Promise<number> {
  // Only the specifically approved amendment is selectable; arbitrary subsets
  // stay injected diagnostics and cannot qualify for either comparison flag.
  const amendedArg = `--protocol=${AMENDED_EVAL_PROTOCOL}`;
  const qwenArg = `--protocol=${QWEN_EVAL_PROTOCOL}`;
  if (args.some((arg) => !["--execute", amendedArg, qwenArg].includes(arg)) || new Set(args).size !== args.length
    || args.filter((arg) => arg.startsWith("--protocol=")).length > 1) {
    console.info(JSON.stringify({ status: "blocked", reason: "INVALID_ARGUMENTS", comparisonComplete: false,
      originalFullThreeModelComparisonComplete: false, amendedComparisonComplete: false, qwenQualificationComplete: false, winner: null })); return 1;
  }
  const result = await runLiveEvaluation({ execute: args.includes("--execute"),
    protocol: args.includes(qwenArg) ? QWEN_EVAL_PROTOCOL : args.includes(amendedArg) ? AMENDED_EVAL_PROTOCOL : "original-three-model" });
  const { rows, ...summary } = result;
  console.info(JSON.stringify({ ...summary, rowCount: rows.length }));
  return result.status === "blocked" ? 1 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
