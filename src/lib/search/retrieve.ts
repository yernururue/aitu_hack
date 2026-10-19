import type { Catalog } from "../contracts/poi";
import type { Intent, RecommendRequest } from "../contracts/request";
import { loadCatalog } from "../data/catalog";
import { filterCandidates } from "./filters";
import { rankCandidates, type RankedPoi } from "./rank";
import { canonicalDatasetHash, cosineSimilarity, DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL, loadIndex, validateIndex, type Embedder } from "./index";

export type RetrievalDependencies = {
  catalog?: Catalog;
  semanticScores?: Readonly<Record<string, number>>;
  index?: unknown;
  embeddingModel?: string;
  embeddingDimensions?: number;
  queryVector?: number[];
  embed?: Embedder;
};

export type RetrievalResult = { candidates: RankedPoi[]; mode: "semantic" | "lexical"; warnings: string[]; dataSnapshot: string };

export async function retrieve(
  request: RecommendRequest,
  intent: Intent,
  now: Date,
  dependencies: RetrievalDependencies = {},
): Promise<RankedPoi[]> {
  return (await retrieveWithMetadata(request, intent, now, dependencies)).candidates;
}

export async function retrieveWithMetadata(
  request: RecommendRequest, intent: Intent, now: Date, dependencies: RetrievalDependencies = {},
): Promise<RetrievalResult> {
  const catalog = dependencies.catalog ?? await loadCatalog();
  const candidates = filterCandidates(catalog.places, intent, request.location, now);
  const dataSnapshot = canonicalDatasetHash(catalog);
  const warnings: string[] = [];
  let semanticScores = dependencies.semanticScores;
  let mode: RetrievalResult["mode"] = semanticScores ? "semantic" : "lexical";
  if (!semanticScores && candidates.length && request.query.trim()) {
    try {
      const model = dependencies.embeddingModel ?? process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
      const dimensions = dependencies.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
      const raw = dependencies.index !== undefined ? dependencies.index : await loadIndex();
      const index = validateIndex(raw, catalog, { model, dimensions });
      const query = dependencies.queryVector ?? (await dependencies.embed?.([request.query], { model, dimensions, inputType: "search_query" }))?.[0];
      if (!query || query.length !== dimensions) throw new Error("QUERY_EMBEDDING_UNAVAILABLE");
      const vectors = new Map(index.vectors.map((vector) => [vector.poiId, vector.values]));
      semanticScores = Object.fromEntries(candidates.map((poi) => [poi.id, (cosineSimilarity(query, vectors.get(poi.id)!) + 1) / 2]));
      mode = "semantic";
    } catch {
      mode = "lexical";
    }
  }
  if (mode === "lexical") warnings.push("Смысловой поиск недоступен. Показан поиск по словам с теми же ограничениями.");
  const ranked = rankCandidates(candidates, {
    query: request.query, origin: request.location, intent, now,
    profileId: request.profileId, savedIds: request.savedIds, dismissedIds: request.dismissedIds,
    queryVector: null, index: null, semanticScores,
  }).slice(0, 8);
  if (ranked.some((item) => item.poi.hours === null)) warnings.push("Время работы некоторых мест не подтверждено.");
  return { candidates: ranked, mode, warnings, dataSnapshot };
}
