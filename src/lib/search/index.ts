import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CatalogSchema, StableIdSchema, type Catalog } from "../contracts/poi";
import { quoteRequest } from "../ai/pricing";
import type { GuardedTransport } from "../ai/transport";
import type { Purpose } from "../ai/config";

export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
export const DOCUMENT_VERSION = "poi-v1";

function isAcceptedEmbeddingResponseModel(requested: string, actual: unknown): boolean {
  // Verified OpenRouter slug / OpenAI native response pair. Do not normalize
  // arbitrary provider namespaces into a seemingly compatible embedding model.
  return requested === DEFAULT_EMBEDDING_MODEL
    && (actual === requested || actual === "text-embedding-3-small");
}

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const VectorSchema = z.array(z.number().finite()).min(1).max(1536).refine((values) => values.some((value) => value !== 0), "Zero vector");
export const IndexSchema = z.strictObject({
  schemaVersion: z.literal("1.0"), model: z.string().trim().min(1).max(200),
  dimensions: z.number().int().min(1).max(1536), datasetHash: HashSchema,
  documentVersion: z.literal(DOCUMENT_VERSION),
  vectors: z.array(z.strictObject({ poiId: StableIdSchema, values: VectorSchema })).min(1).max(10_000),
}).superRefine((index, ctx) => {
  const ids = new Set<string>();
  index.vectors.forEach((vector, i) => {
    if (ids.has(vector.poiId)) ctx.addIssue({ code: "custom", path: ["vectors", i, "poiId"], message: "Duplicate vector ID" });
    ids.add(vector.poiId);
    if (vector.values.length !== index.dimensions) ctx.addIssue({ code: "custom", path: ["vectors", i, "values"], message: "Mixed vector dimensions" });
  });
});
export type Index = z.infer<typeof IndexSchema>;

export const QueryVectorCacheSchema = z.strictObject({
  schemaVersion: z.literal("1.0"), model: z.string().min(1).max(200), dimensions: z.number().int().min(1).max(1536),
  datasetHash: HashSchema, queries: z.record(HashSchema, VectorSchema),
}).superRefine((cache, ctx) => {
  for (const [key, values] of Object.entries(cache.queries)) {
    if (values.length !== cache.dimensions) ctx.addIssue({ code: "custom", path: ["queries", key], message: "Query vector dimensions mismatch" });
  }
});
export type QueryVectorCache = z.infer<typeof QueryVectorCacheSchema>;

function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
export function canonicalDatasetHash(catalog: Catalog): string { return hash(JSON.stringify(CatalogSchema.parse(catalog))); }
export function rawQueryHash(query: string): string { return hash(query); }

export function validateQueryCache(raw: unknown, catalog: Catalog, expected: { model: string; dimensions: number }): QueryVectorCache {
  const cache = QueryVectorCacheSchema.parse(raw);
  if (cache.model !== expected.model || cache.dimensions !== expected.dimensions || cache.datasetHash !== canonicalDatasetHash(catalog)) throw new Error("INCOMPATIBLE_QUERY_CACHE");
  return cache;
}

export function validateIndex(raw: unknown, catalog: Catalog, expected: { model: string; dimensions: number }): Index {
  const index = IndexSchema.parse(raw);
  if (index.model !== expected.model || index.dimensions !== expected.dimensions || index.datasetHash !== canonicalDatasetHash(catalog)) throw new Error("INCOMPATIBLE_INDEX");
  const ids = new Set(catalog.places.map((poi) => poi.id));
  if (index.vectors.length !== ids.size || index.vectors.some((vector) => !ids.has(vector.poiId))) throw new Error("INCOMPLETE_OR_UNKNOWN_INDEX_IDS");
  return index;
}

function shortText(text: string): string {
  const cleaned = text.replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/giu, "").replace(/\s+/gu, " ").trim();
  let output = ""; let bytes = 0;
  for (const char of cleaned) {
    const length = Buffer.byteLength(char, "utf8");
    if (bytes + length > 4000) break;
    output += char; bytes += length;
  }
  return output;
}
export type PreparedDocument = { poiId: string; text: string; documentHash: string };
export function prepareDocuments(catalog: Catalog): PreparedDocument[] {
  return CatalogSchema.parse(catalog).places.map((poi) => {
    const facts = poi.facts.filter((fact) => fact.confidence === "confirmed").map((fact) => `${fact.key}=${fact.value}`).sort();
    const text = shortText(`name: ${poi.name}\ncategory: ${poi.category}\ntags: ${[...poi.tags].sort().join(", ")}\nconfirmedFacts: ${facts.join(", ")}\ndescription: ${poi.description.text}`);
    return { poiId: poi.id, text, documentHash: hash(text) };
  });
}

export function cosineSimilarity(first: number[], second: number[]): number {
  const a = VectorSchema.parse(first); const b = VectorSchema.parse(second);
  if (a.length !== b.length) throw new Error("VECTOR_DIMENSION_MISMATCH");
  const scaleA = Math.max(...a.map(Math.abs)); const scaleB = Math.max(...b.map(Math.abs));
  let dot = 0; let normA = 0; let normB = 0;
  a.forEach((value, i) => {
    const x = value / scaleA; const y = b[i] / scaleB;
    dot += x * y; normA += x * x; normB += y * y;
  });
  return Math.max(-1, Math.min(1, dot / Math.sqrt(normA * normB)));
}

export type EmbeddingOptions = { model: string; dimensions: number; inputType: "search_document" | "search_query" };
export type Embedder = (texts: string[], options: EmbeddingOptions) => Promise<number[][]>;
const CacheEntrySchema = z.strictObject({
  model: z.string().min(1), dimensions: z.number().int().min(1).max(1536),
  documentVersion: z.literal(DOCUMENT_VERSION), documentHash: HashSchema, values: VectorSchema,
}).refine((entry) => entry.values.length === entry.dimensions, "Cache vector dimensions mismatch");
export const EmbeddingCacheSchema = z.strictObject({ schemaVersion: z.literal("1.0"), entries: z.record(HashSchema, CacheEntrySchema) });
export type EmbeddingCache = z.infer<typeof EmbeddingCacheSchema>;
function cacheKey(doc: PreparedDocument, model: string, dimensions: number): string {
  return hash(JSON.stringify([model, dimensions, DOCUMENT_VERSION, doc.documentHash]));
}

export async function buildIndex(catalog: Catalog, options: { model: string; dimensions: number; embed?: Embedder; cache?: unknown; batchSize?: number; checkpoint?: (cache: EmbeddingCache) => Promise<void> }) {
  const model = z.string().trim().min(1).max(200).parse(options.model);
  const dimensions = z.number().int().min(1).max(1536).parse(options.dimensions);
  const batchSize = z.number().int().min(1).max(64).parse(options.batchSize ?? 32);
  const cache = EmbeddingCacheSchema.parse(options.cache ?? { schemaVersion: "1.0", entries: {} });
  const docs = prepareDocuments(catalog);
  const values = new Map<string, number[]>(); const missing: PreparedDocument[] = [];
  const pending = new Set<string>();
  for (const doc of docs) {
    const key = cacheKey(doc, model, dimensions);
    const entry = cache.entries[key];
    if (entry && entry.model === model && entry.dimensions === dimensions && entry.documentHash === doc.documentHash) values.set(doc.poiId, entry.values);
    else if (!pending.has(key)) { missing.push(doc); pending.add(key); }
  }
  if (missing.length && !options.embed) throw new Error("EMBEDDINGS_UNAVAILABLE");
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const response = await options.embed!(batch.map((doc) => doc.text), { model, dimensions, inputType: "search_document" });
    const vectors = z.array(VectorSchema).length(batch.length).parse(response);
    if (vectors.some((vector) => vector.length !== dimensions)) throw new Error("VECTOR_DIMENSION_MISMATCH");
    vectors.forEach((vector, i) => {
      const doc = batch[i]; values.set(doc.poiId, vector);
      cache.entries[cacheKey(doc, model, dimensions)] = { model, dimensions, documentVersion: DOCUMENT_VERSION, documentHash: doc.documentHash, values: vector };
    });
    // Persist validated completed work before any later billable batch.
    await options.checkpoint?.(EmbeddingCacheSchema.parse(cache));
  }
  const index = validateIndex({ schemaVersion: "1.0", model, dimensions, datasetHash: canonicalDatasetHash(catalog), documentVersion: DOCUMENT_VERSION, vectors: docs.map((doc) => ({ poiId: doc.poiId, values: values.get(doc.poiId) ?? cache.entries[cacheKey(doc, model, dimensions)].values })) }, catalog, { model, dimensions });
  return { index, cache, reused: docs.length - missing.length, embedded: missing.length };
}

/** Each batch/query receives its own quote and durable guard reservation. */
export function createGuardedEmbedder(transport: Pick<GuardedTransport, "execute">, purpose: Purpose = "prep"): Embedder {
  return async (texts, options) => {
    const quote = quoteRequest({ operation: options.inputType === "search_document" ? "index_embedding" : "query_embedding", model: options.model, inputCount: texts.length });
    const raw = await transport.execute({ purpose, quote, body: { input: texts, dimensions: options.dimensions, encoding_format: "float" } });
    const response = z.object({ model: z.string().optional(), data: z.array(z.strictObject({ index: z.number().int().min(0), embedding: VectorSchema, object: z.string().optional() })).length(texts.length) }).parse(raw);
    if (!isAcceptedEmbeddingResponseModel(options.model, response.model)) throw new Error("EMBEDDING_MODEL_MISMATCH");
    const ordered = new Map(response.data.map((row) => [row.index, row.embedding]));
    if (ordered.size !== texts.length || response.data.some((row) => row.index >= texts.length || row.embedding.length !== options.dimensions)) throw new Error("EMBEDDING_RESPONSE_MISMATCH");
    return texts.map((_text, index) => ordered.get(index)!);
  };
}

export async function loadIndex(): Promise<Index | null> {
  try {
    const configuredPath = process.env.APP_INDEX_PATH;
    const text = configuredPath ? await readFile(configuredPath, "utf8") : await readFile(join(process.cwd(), "data/index/places.json"), "utf8");
    return IndexSchema.parse(JSON.parse(text));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw new Error("INDEX_UNAVAILABLE");
  }
}
