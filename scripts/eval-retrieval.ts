import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CatalogSchema, FactKeySchema, type Catalog } from "../src/lib/contracts/poi";
import { IntentSchema, RecommendRequestSchema } from "../src/lib/contracts/request";
import { canonicalDatasetHash, createGuardedEmbedder, DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL, rawQueryHash, validateIndex, validateQueryCache, type Embedder, type QueryVectorCache } from "../src/lib/search/index";
import { retrieveWithMetadata } from "../src/lib/search/retrieve";
import { createLiveTransport } from "../src/lib/ai/transport";
import { protectArtifactPaths, writeJsonAtomic } from "./build-index";

const EvalCaseSchema = z.object({
  id: z.string().min(1), kind: z.enum(["retrieval_positive", "negative_guard"]), now: z.iso.datetime({ offset: true }),
  request: RecommendRequestSchema,
  labelCriteria: z.object({ requiredFacts: z.array(FactKeySchema) }),
  expected: z.object({ relevantIds: z.array(z.string()), hardEligibleIds: z.array(z.string()) }),
});
export type MeasurementRow = {
  id?: string; query?: string; kind: string; relevantIds: readonly string[];
  actualTop3: readonly string[]; actualTop5: readonly string[];
  hardConstraintPass: boolean; negativePass: boolean | null; mode: string;
};

export type EvaluationDependencies = {
  index?: unknown; embeddingModel?: string; embeddingDimensions?: number;
  queryCache?: unknown; embed?: Embedder;
  checkpointQueries?: (cache: QueryVectorCache) => Promise<void>;
};

export async function evaluateCases(catalog: Catalog, rawCases: readonly unknown[], dependencies: EvaluationDependencies = {}) {
  const model = dependencies.embeddingModel ?? process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const dimensions = dependencies.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  let cache: QueryVectorCache | undefined;
  try {
    cache = validateQueryCache(dependencies.queryCache === undefined ? { schemaVersion: "1.0", model, dimensions, datasetHash: canonicalDatasetHash(catalog), queries: {} } : dependencies.queryCache, catalog, { model, dimensions });
  } catch { cache = undefined; }
  const rows = [];
  for (const raw of rawCases) {
    const item = EvalCaseSchema.parse(raw);
    // Oracle semantic tags, exactName and gold IDs never enter this intent or ranking.
    const intent = IntentSchema.parse({ ...item.request.filters, requiredFacts: item.labelCriteria.requiredFacts, preferredTags: [], conflict: null });
    const key = rawQueryHash(item.request.query);
    let checkpointFailed = false;
    const embed: Embedder | undefined = cache && dependencies.embed ? async (texts, options) => {
      // Retrieval asks for exactly the unchanged raw query, never label criteria.
      if (texts.length !== 1 || texts[0] !== item.request.query || options.inputType !== "search_query") throw new Error("RAW_QUERY_REQUIRED");
      const vectors = await dependencies.embed!(texts, options);
      if (vectors.length !== 1) throw new Error("QUERY_EMBEDDING_RESPONSE_MISMATCH");
      const next = validateQueryCache({ ...cache, queries: { ...cache!.queries, [key]: vectors[0] } }, catalog, { model, dimensions });
      try { await dependencies.checkpointQueries?.(next); }
      catch { checkpointFailed = true; throw new Error("QUERY_CHECKPOINT_FAILED"); }
      cache = next;
      return vectors;
    } : undefined;
    const result = await retrieveWithMetadata(item.request, intent, new Date(item.now), {
      catalog, index: dependencies.index, embeddingModel: model, embeddingDimensions: dimensions,
      queryVector: cache?.queries[key], embed,
    });
    // Retrieval preserves lexical fallback on embedding failures; storage failure
    // must still stop the evaluator before another potentially billable query.
    if (checkpointFailed) throw new Error("QUERY_CHECKPOINT_FAILED");
    if (result.mode === "lexical" && item.request.query.trim() && !cache?.queries[key]) result.warnings.push(cache ? "В кеше нет совместимого вектора этого запроса." : "Кеш векторов запросов несовместим или повреждён.");
    const actual = result.candidates.map((candidate) => candidate.poi.id);
    rows.push({ id: item.id, query: item.request.query, kind: item.kind, relevantIds: item.expected.relevantIds,
      expectedHardEligibleIds: item.expected.hardEligibleIds, actualTop3: actual.slice(0, 3), actualTop5: actual.slice(0, 5),
      hardConstraintPass: actual.every((id) => item.expected.hardEligibleIds.includes(id)),
      negativePass: item.kind === "negative_guard" ? actual.length === 0 : null,
      mode: result.mode, warnings: result.warnings, dataSnapshot: result.dataSnapshot });
  }
  return rows;
}

export function summarizeRetrieval(rows: readonly MeasurementRow[]) {
  const positive = rows.filter((row) => row.kind === "retrieval_positive");
  const negative = rows.filter((row) => row.kind === "negative_guard");
  const hits = positive.map((row) => new Set(row.actualTop5.filter((id) => row.relevantIds.includes(id))).size);
  const relevantTotal = positive.reduce((sum, row) => sum + row.relevantIds.length, 0);
  const top3Success = positive.filter((row) => row.actualTop3.some((id) => row.relevantIds.includes(id))).length;
  const macroRecallAt5 = positive.length ? positive.reduce((sum, row, i) => sum + hits[i] / (row.relevantIds.length || 1), 0) / positive.length : 0;
  const microRecallAt5 = relevantTotal ? hits.reduce((sum, hit) => sum + hit, 0) / relevantTotal : 0;
  const hardConstraintsPassed = rows.every((row) => row.hardConstraintPass);
  const negativePassed = negative.filter((row) => row.negativePass).length;
  const semanticVerified = positive.length > 0 && positive.every((row) => row.mode === "semantic");
  const qualityGatePassed = positive.length === 12 && top3Success >= 10 && macroRecallAt5 >= 0.9 && hardConstraintsPassed && negativePassed === negative.length;
  return { positiveCases: positive.length, negativeCases: negative.length, top3Success, macroRecallAt5, microRecallAt5,
    negativePassed, hardConstraintsPassed, semanticVerified, qualityGatePassed, acceptancePassed: qualityGatePassed && semanticVerified };
}

export async function main(args: string[]): Promise<number> {
  try {
    const options = new Map<string, string>(); let prepareQueries = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--prepare-queries" && !prepareQueries) { prepareQueries = true; continue; }
      if (!["--query-cache", "--index", "--model", "--dimensions"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("INVALID_ARGUMENTS");
      options.set(args[i], args[++i]);
    }
    const paths = await protectArtifactPaths(["data/catalog/places.json", "evals/real-cases.json", options.get("--index") ?? process.env.APP_INDEX_PATH ?? "data/index/places.json"], [options.get("--query-cache") ?? "data/index/query-vectors.json"]);
    const [catalogPath, labelsPath, indexPath] = paths.inputs;
    const [queryCachePath] = paths.outputs;
    const labelText = await readFile(labelsPath, "utf8");
    const labels = z.object({ synthetic: z.literal(false), metadata: z.object({ catalogPath: z.literal("data/catalog/places.json"), catalogSha256: z.string().regex(/^[a-f0-9]{64}$/) }), cases: z.array(EvalCaseSchema) }).parse(JSON.parse(labelText));
    const catalogText = await readFile(catalogPath, "utf8");
    const catalogFileSha256 = createHash("sha256").update(catalogText, "utf8").digest("hex");
    if (catalogFileSha256 !== labels.metadata.catalogSha256) throw new Error("FROZEN_CATALOG_MISMATCH");
    const catalog = CatalogSchema.parse(JSON.parse(catalogText));
    if (catalog.synthetic) throw new Error("REAL_CATALOG_REQUIRED");
    const model = options.get("--model") ?? process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
    const dimensions = Number(options.get("--dimensions") ?? DEFAULT_EMBEDDING_DIMENSIONS);
    let index: unknown = null; let queryCache: unknown;
    try { index = JSON.parse(await readFile(indexPath, "utf8")); } catch { /* Offline invalid/missing index gives visible lexical fallback. */ }
    try { queryCache = JSON.parse(await readFile(queryCachePath, "utf8")); }
    catch (error) { queryCache = error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? undefined : null; }
    let embed: Embedder | undefined;
    if (prepareQueries) {
      validateIndex(index, catalog, { model, dimensions });
      if (queryCache === null) throw new Error("QUERY_CACHE_UNAVAILABLE");
      queryCache = validateQueryCache(queryCache ?? { schemaVersion: "1.0", model, dimensions, datasetHash: canonicalDatasetHash(catalog), queries: {} }, catalog, { model, dimensions });
      // Only this explicit branch can construct a paid-enabled guarded transport.
      embed = createGuardedEmbedder(createLiveTransport(), "live_eval");
      await writeJsonAtomic(queryCachePath, queryCache);
    }
    console.info(JSON.stringify({ type: "metadata", synthetic: false, catalogFileSha256, labelSha256: createHash("sha256").update(labelText, "utf8").digest("hex"), dataSnapshot: canonicalDatasetHash(catalog), queryPreparation: prepareQueries ? "guarded_live_eval" : "offline_cache_only", intentEvaluation: "fixed_UI_filters_plus_declared_requiredFacts; raw_query_unchanged; intent_quality_not_evaluated" }));
    const rows = await evaluateCases(catalog, labels.cases, { index, embeddingModel: model, embeddingDimensions: dimensions, queryCache, embed, checkpointQueries: prepareQueries ? (cache) => writeJsonAtomic(queryCachePath, cache) : undefined });
    rows.forEach((row) => console.info(JSON.stringify({ type: "case", ...row })));
    const summary = summarizeRetrieval(rows);
    console.info(JSON.stringify({ type: "summary", ...summary }));
    return summary.acceptancePassed ? 0 : 1;
  } catch {
    console.error("Retrieval evaluation blocked: verify frozen catalogue hash, labels and runtime contract.");
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
