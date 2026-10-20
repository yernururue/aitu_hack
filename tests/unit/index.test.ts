import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "../../evals/fixtures/places.json";
import { CatalogSchema } from "@/lib/contracts/poi";
import { createDefaultFilters, type Intent, type RecommendRequest } from "@/lib/contracts/request";
import { CatalogLoadError } from "@/lib/data/catalog";
import * as aiTransport from "@/lib/ai/transport";
import { main as buildIndexMain, protectArtifactPaths, writeJsonAtomic } from "../../scripts/build-index";
import {
  IndexSchema, buildIndex, canonicalDatasetHash, cosineSimilarity, createGuardedEmbedder,
  prepareDocuments, validateIndex, validateQueryCache, type Embedder,
} from "@/lib/search/index";
import { retrieveWithMetadata } from "@/lib/search/retrieve";
import { evaluateCases, summarizeRetrieval } from "../../scripts/eval-retrieval";

const catalog = CatalogSchema.parse({ ...fixtures, places: fixtures.places.slice(0, 2) });
const model = "openai/text-embedding-3-small";
function sampleIndex() {
  return { schemaVersion: "1.0", model, dimensions: 2, datasetHash: canonicalDatasetHash(catalog), documentVersion: "poi-v1", vectors: catalog.places.map((poi, index) => ({ poiId: poi.id, values: index ? [0, 1] : [1, 0] })) };
}
function request(): RecommendRequest {
  return { query: "Кофе", locale: "ru", location: { lat: 51.09, lon: 71.42, source: "preset" }, filters: { ...createDefaultFilters(), categories: ["cafe"] }, explicitFilterKeys: ["categories"], profileId: null, savedIds: [], dismissedIds: [] };
}
function intent(): Intent { return { ...request().filters, requiredFacts: [], preferredTags: [], conflict: null }; }
const now = new Date("2026-10-20T07:00:00Z");
const tempDirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("index validation and canonical identity", () => {
  it("hashes schema-canonical compact JSON, independently of input key order", () => {
    const expected = createHash("sha256").update(JSON.stringify(CatalogSchema.parse(catalog))).digest("hex");
    expect(canonicalDatasetHash({ places: catalog.places, synthetic: true, schemaVersion: "1.0" })).toBe(expected);
    expect(canonicalDatasetHash(catalog)).not.toBe(createHash("sha256").update(JSON.stringify(catalog, null, 2)).digest("hex"));
  });

  it("accepts a complete compatible index", () => {
    expect(validateIndex(sampleIndex(), catalog, { model, dimensions: 2 }).vectors).toHaveLength(2);
  });

  it.each([
    ["wrong hash", () => ({ ...sampleIndex(), datasetHash: "0".repeat(64) })],
    ["wrong model", () => ({ ...sampleIndex(), model: "other/model" })],
    ["wrong dimensions", () => ({ ...sampleIndex(), dimensions: 3 })],
    ["mixed dimensions", () => { const i = sampleIndex(); i.vectors[0].values = [1]; return i; }],
    ["duplicate ID", () => { const i = sampleIndex(); i.vectors[1].poiId = i.vectors[0].poiId; return i; }],
    ["unknown ID", () => { const i = sampleIndex(); i.vectors[0].poiId = "unknown:poi"; return i; }],
    ["missing catalogue member", () => ({ ...sampleIndex(), vectors: sampleIndex().vectors.slice(0, 1) })],
    ["nonfinite vector", () => { const i = sampleIndex(); i.vectors[0].values[0] = Infinity; return i; }],
    ["zero vector", () => { const i = sampleIndex(); i.vectors[0].values = [0, 0]; return i; }],
  ])("rejects %s", (_label, input) => {
    expect(() => validateIndex(input(), catalog, { model, dimensions: 2 })).toThrow();
  });

  it("enforces runtime schema shape without coercion", () => {
    expect(IndexSchema.safeParse({ ...sampleIndex(), secret: "unexpected" }).success).toBe(false);
    expect(IndexSchema.safeParse({ ...sampleIndex(), schemaVersion: "2.0" }).success).toBe(false);
  });

  it("computes stable cosine for same, orthogonal, opposite and huge finite vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosineSimilarity([1e308, 1e308], [1e308, 1e308])).toBeCloseTo(1);
    expect(() => cosineSimilarity([0, 0], [1, 0])).toThrow();
    expect(() => cosineSimilarity([1], [1, 0])).toThrow();
  });
});

describe("prepared documents, cache and guarded batching", () => {
  it("includes the catalogue name in the short source-derived document", () => {
    const renamed = structuredClone(catalog);
    renamed.places[0].name = "Уникальное имя только из поля POI";
    expect(prepareDocuments(renamed)[0].text).toContain("Уникальное имя только из поля POI");
  });

  it("sends only bounded prepared fields, never review bodies, URLs or source IDs", () => {
    const input = structuredClone(catalog);
    input.places[0].description.text = `Подтверждённое описание https://example.com/private ${"Текст ".repeat(2000)}`;
    input.places[0].reviews[0].text = "PRIVATE_REVIEW_MUST_NOT_BE_EMBEDDED";
    const docs = prepareDocuments(input);
    expect(docs[0].text).not.toContain("PRIVATE_REVIEW");
    expect(docs[0].text).not.toContain("https://");
    expect(docs[0].text).not.toContain("source:fixture");
    expect(docs[0].text).toContain("outlets=true");
    expect(docs[0].text).not.toContain("quiet=true");
    expect(Buffer.byteLength(docs[0].text)).toBeLessThanOrEqual(4000);
  });

  it("refuses to build missing vectors without an embedder and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
    await expect(buildIndex(catalog, { model, dimensions: 2 })).rejects.toThrow("EMBEDDINGS_UNAVAILABLE");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reuses unchanged document embeddings across non-document dataset changes", async () => {
    const embed: Embedder = vi.fn(async (texts) => texts.map(() => [1, 0]));
    const first = await buildIndex(catalog, { model, dimensions: 2, embed, batchSize: 1 });
    expect(embed).toHaveBeenCalledTimes(2);
    const changed = structuredClone(catalog);
    changed.places[0].rating = null;
    const second = await buildIndex(changed, { model, dimensions: 2, cache: first.cache, embed });
    expect(second).toMatchObject({ reused: 2, embedded: 0 });
    expect(second.index.datasetHash).not.toBe(first.index.datasetHash);
    expect(embed).toHaveBeenCalledTimes(2);
    changed.places[0].description.text = "Изменённое краткое описание";
    const third = await buildIndex(changed, { model, dimensions: 2, cache: second.cache, embed });
    expect(third).toMatchObject({ reused: 1, embedded: 1 });
    expect(embed).toHaveBeenCalledTimes(3);
  });

  it("does not reuse cache entries for another model or dimensions", async () => {
    const first = await buildIndex(catalog, { model, dimensions: 2, embed: async (texts) => texts.map(() => [1, 0]) });
    await expect(buildIndex(catalog, { model: "other/model", dimensions: 2, cache: first.cache })).rejects.toThrow("EMBEDDINGS_UNAVAILABLE");
    await expect(buildIndex(catalog, { model, dimensions: 3, cache: first.cache })).rejects.toThrow("EMBEDDINGS_UNAVAILABLE");
  });

  it("embeds identical prepared document hashes once within a new batch", async () => {
    const repeated = CatalogSchema.parse({ ...catalog, places: [catalog.places[0], { ...catalog.places[0], id: "fixture:second-copy" }] });
    const embed: Embedder = vi.fn(async (texts) => texts.map(() => [1, 0]));
    const result = await buildIndex(repeated, { model, dimensions: 2, embed });
    expect(embed).toHaveBeenCalledWith([expect.any(String)], expect.any(Object));
    expect(result.index.vectors).toHaveLength(2);
    expect(result.embedded).toBe(1);
  });

  it("quotes and dispatches each embedding batch through the guarded transport", async () => {
    const execute = vi.fn(async (args: { purpose: string; quote: { operation: string; inputCount?: number }; body: unknown }) => {
      const inputs = (args.body as { input: string[] }).input;
      expect(args.purpose).toBe("prep");
      expect(args.quote.operation).toBe("index_embedding");
      expect(args.quote.inputCount).toBe(inputs.length);
      return { model, data: inputs.map((_text, index) => ({ index, embedding: [1, 0] })) };
    });
    const embed = createGuardedEmbedder({ execute });
    const result = await buildIndex(catalog, { model, dimensions: 2, batchSize: 1, embed });
    expect(result.embedded).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("does not persist fake vectors in a real-catalogue default dry run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aituhack-index-")); tempDirs.push(directory);
    const output = join(directory, "places.json");
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/build-index.ts", "--output", output], {
      cwd: resolve("."), encoding: "utf8", env: { ...process.env, OPENROUTER_PAID_ENABLED: "false" },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "dry_run", written: false });
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["--output", "--cache"])("protects the effective APP_DATASET_PATH before transport construction for %s", async (flag) => {
    const directory = await mkdtemp(join(tmpdir(), "aituhack-collision-")); tempDirs.push(directory);
    const input = join(directory, "catalog.json");
    const original = JSON.stringify(catalog);
    await writeFile(input, original);
    vi.stubEnv("APP_DATASET_PATH", input); vi.stubEnv("APP_USE_SYNTHETIC", "true");
    const execute = vi.fn(async (args: { body: unknown }) => ({ model, data: (args.body as { input: string[] }).input.map((_text, index) => ({ index, embedding: [1, 0] })) }));
    const factory = vi.spyOn(aiTransport, "createLiveTransport").mockReturnValue({ execute } as unknown as aiTransport.GuardedTransport);
    const args = ["--execute", "--dimensions", "2", "--output", flag === "--output" ? input : join(directory, "index.json"), "--cache", flag === "--cache" ? input : join(directory, "cache.json")];
    expect(await buildIndexMain(args)).toBe(1);
    expect(factory).not.toHaveBeenCalled();
    expect(await readFile(input, "utf8")).toBe(original);
  });

  it.each([
    ["explicit", "--output"], ["explicit", "--cache"],
    ["default", "--output"], ["default", "--cache"],
    ["synthetic", "--output"], ["synthetic", "--cache"],
  ])("protects the %s source for %s before constructing transport", async (source, flag) => {
    const directory = await mkdtemp(join(tmpdir(), "aituhack-default-collision-")); tempDirs.push(directory);
    const relative = source === "synthetic" ? "evals/fixtures/places.json" : "data/catalog/places.json";
    const input = join(directory, relative); const original = JSON.stringify(catalog);
    await mkdir(join(input, ".."), { recursive: true }); await writeFile(input, original);
    vi.stubEnv("APP_DATASET_PATH", ""); vi.stubEnv("APP_USE_SYNTHETIC", source === "synthetic" ? "true" : "false");
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const factory = vi.spyOn(aiTransport, "createLiveTransport");
    expect(await buildIndexMain(["--execute", ...(source === "explicit" ? ["--input", input] : []), "--output", flag === "--output" ? input : join(directory, "index.json"), "--cache", flag === "--cache" ? input : join(directory, "cache.json")])).toBe(1);
    expect(factory).not.toHaveBeenCalled(); expect(await readFile(input, "utf8")).toBe(original);
  });

  it("rejects input/output and absent-output aliases through symlinked parents", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aituhack-alias-")); tempDirs.push(directory);
    const actual = join(directory, "actual"); const alias = join(directory, "alias");
    await mkdir(actual); await symlink(actual, alias, "dir"); await writeFile(join(actual, "catalog.json"), JSON.stringify(catalog));
    await expect(protectArtifactPaths([join(actual, "catalog.json")], [join(alias, "catalog.json")])).rejects.toThrow("PATHS_MUST_BE_DISTINCT");
    await expect(protectArtifactPaths([], [join(actual, "future/cache.json"), join(alias, "future/cache.json")])).rejects.toThrow("PATHS_MUST_BE_DISTINCT");
  });

  it("checkpoints a completed batch before failure and resumes without paying for that document again", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aituhack-resume-")); tempDirs.push(directory);
    const path = join(directory, "cache.json");
    let calls = 0;
    const embed: Embedder = async (texts) => { calls++; if (calls === 2) throw new Error("SECOND_BATCH_FAILED"); return texts.map(() => [1, 0]); };
    await expect(buildIndex(catalog, { model, dimensions: 2, batchSize: 1, embed, checkpoint: (cache) => writeJsonAtomic(path, cache) })).rejects.toThrow("SECOND_BATCH_FAILED");
    const saved = JSON.parse(await readFile(path, "utf8"));
    expect(Object.keys(saved.entries)).toHaveLength(1);
    const resume: Embedder = vi.fn(async (texts) => texts.map(() => [0, 1]));
    const result = await buildIndex(catalog, { model, dimensions: 2, cache: saved, embed: resume });
    expect(result).toMatchObject({ reused: 1, embedded: 1 });
    expect(resume).toHaveBeenCalledWith([prepareDocuments(catalog)[1].text], expect.any(Object));
  });

  it("does not dispatch a later batch when a checkpoint cannot be persisted", async () => {
    const embed: Embedder = vi.fn(async (texts) => texts.map(() => [1, 0]));
    await expect(buildIndex(catalog, { model, dimensions: 2, batchSize: 1, embed, checkpoint: async () => { throw new Error("STORAGE_FAILED"); } })).rejects.toThrow("STORAGE_FAILED");
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("does not checkpoint any part of a malformed batch", async () => {
    const checkpoint = vi.fn(async () => {});
    await expect(buildIndex(catalog, { model, dimensions: 2, embed: async () => [[1, 0], [1]], checkpoint })).rejects.toThrow("VECTOR_DIMENSION_MISMATCH");
    expect(checkpoint).not.toHaveBeenCalled();
  });
});

describe("guarded embedding response identity", () => {
  it.each([model, "text-embedding-3-small"])("accepts the verified response name %s with a complete1536-vector", async (responseModel) => {
    const values = [1, ...Array<number>(1535).fill(0)];
    const embed = createGuardedEmbedder({ execute: async () => ({ model: responseModel, data: [{ index: 0, embedding: values }] }) }, "live_eval");
    await expect(embed(["Контролируемый запрос"], { model, dimensions: 1536, inputType: "search_query" })).resolves.toEqual([values]);
  });

  it("keeps the requested slug in the index and document cache after a verified native response", async () => {
    const embed = createGuardedEmbedder({ execute: async (args) => ({
      model: "text-embedding-3-small",
      data: (args.body as { input: string[] }).input.map((_text, index) => ({ index, embedding: [1, 0] })),
    }) });
    const result = await buildIndex(catalog, { model, dimensions: 2, embed });
    expect(result.index.model).toBe("openai/text-embedding-3-small");
    expect(result.index.vectors).toHaveLength(2);
    expect(Object.values(result.cache.entries).map((entry) => entry.model)).toEqual([model, model]);
  });

  it.each([
    "text-embedding-3-large", "openai/text-embedding-3-large", "other/text-embedding-3-small",
    "openai/other/text-embedding-3-small", "openai/text-embedding-3-small:free",
    "Text-embedding-3-small", " text-embedding-3-small", "text-embedding-3-small ", "", undefined,
  ])("rejects an unverified response name %s rather than normalizing it", async (responseModel) => {
    const embed = createGuardedEmbedder({ execute: async () => ({ model: responseModel, data: [{ index: 0, embedding: [1, 0] }] }) });
    await expect(embed(["Документ"], { model, dimensions: 2, inputType: "search_document" })).rejects.toThrow("EMBEDDING_MODEL_MISMATCH");
  });

  it("does not authorize another requested namespace using the known native response", async () => {
    const embed = createGuardedEmbedder({ execute: async () => ({ model: "text-embedding-3-small", data: [{ index: 0, embedding: [1, 0] }] }) });
    await expect(embed(["Документ"], { model: "other/text-embedding-3-small", dimensions: 2, inputType: "search_document" })).rejects.toThrow("UNKNOWN_MODEL");
  });

  it.each([
    ["wrong dimensions", [{ index: 0, embedding: [1] }, { index: 1, embedding: [0, 1] }]],
    ["duplicate indexes", [{ index: 0, embedding: [1, 0] }, { index: 0, embedding: [0, 1] }]],
    ["missing index zero", [{ index: 1, embedding: [1, 0] }, { index: 2, embedding: [0, 1] }]],
  ])("still rejects %s after accepting the native model name", async (_label, data) => {
    const embed = createGuardedEmbedder({ execute: async () => ({ model: "text-embedding-3-small", data }) });
    await expect(embed(["Первый", "Второй"], { model, dimensions: 2, inputType: "search_document" })).rejects.toThrow("EMBEDDING_RESPONSE_MISMATCH");
  });

  it.each([
    ["partial batch", [{ index: 0, embedding: [1, 0] }]],
    ["extra vector", [{ index: 0, embedding: [1, 0] }, { index: 1, embedding: [0, 1] }, { index: 2, embedding: [1, 1] }]],
    ["zero vector", [{ index: 0, embedding: [0, 0] }, { index: 1, embedding: [0, 1] }]],
    ["nonfinite vector", [{ index: 0, embedding: [Infinity, 0] }, { index: 1, embedding: [0, 1] }]],
  ])("rejects a native-model response containing a %s", async (_label, data) => {
    const embed = createGuardedEmbedder({ execute: async () => ({ model: "text-embedding-3-small", data }) });
    await expect(embed(["Первый", "Второй"], { model, dimensions: 2, inputType: "search_document" })).rejects.toMatchObject({ name: "ZodError" });
  });
});

describe("visible semantic retrieval and safe lexical fallback", () => {
  it("does not turn an unavailable catalogue into an empty lexical response", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aituhack-catalog-missing-")); tempDirs.push(directory);
    vi.stubEnv("APP_DATASET_PATH", join(directory, "missing.json")); vi.stubEnv("APP_USE_SYNTHETIC", "false");
    await expect(retrieveWithMetadata(request(), intent(), now, { index: null })).rejects.toBeInstanceOf(CatalogLoadError);
  });
  it("labels missing-index fallback without network and retains hard constraints", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
    const result = await retrieveWithMetadata(request(), { ...intent(), maxSpendKzt: 100 }, now, { catalog, index: null });
    expect(result).toMatchObject({ mode: "lexical", candidates: [], dataSnapshot: canonicalDatasetHash(catalog) });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses validated same-model query vectors and reports semantic mode", async () => {
    const result = await retrieveWithMetadata(request(), intent(), now, { catalog, index: sampleIndex(), embeddingModel: model, embeddingDimensions: 2, queryVector: [1, 0] });
    expect(result.mode).toBe("semantic");
    expect(result.candidates[0].poi.id).toBe(catalog.places[0].id);
  });

  it("does not call query embedding for an incompatible index", async () => {
    const embed: Embedder = vi.fn(async () => [[1, 0]]);
    const result = await retrieveWithMetadata(request(), intent(), now, { catalog, index: { ...sampleIndex(), model: "wrong/model" }, embeddingModel: model, embeddingDimensions: 2, embed });
    expect(result.mode).toBe("lexical");
    expect(embed).not.toHaveBeenCalled();
  });

  it("falls back after query embedding failure and does not erase the strict budget", async () => {
    const embed: Embedder = vi.fn(async () => { throw new Error("UNAVAILABLE"); });
    const result = await retrieveWithMetadata(request(), { ...intent(), maxSpendKzt: 2500 }, now, { catalog, index: sampleIndex(), embeddingModel: model, embeddingDimensions: 2, embed });
    expect(result.mode).toBe("lexical");
    expect(result.candidates.map((item) => item.poi.id)).toEqual(["fixture:quiet-cafe"]);
    expect(embed).toHaveBeenCalledTimes(1);
  });
});

describe("frozen-label retrieval measurement", () => {
  const evalCase = () => ({ id: "semantic-unit", kind: "retrieval_positive", now: now.toISOString(), request: request(), labelCriteria: { requiredFacts: [] }, expected: { relevantIds: [catalog.places[0].id], hardEligibleIds: catalog.places.map((poi) => poi.id) } });
  const queryCache = () => ({ schemaVersion: "1.0", model, dimensions: 2, datasetHash: canonicalDatasetHash(catalog), queries: { [createHash("sha256").update(request().query).digest("hex")]: [1, 0] } });

  it.each([
    ["version", () => ({ ...queryCache(), schemaVersion: "2.0" })],
    ["model", () => ({ ...queryCache(), model: "other/model" })],
    ["dimensions", () => ({ ...queryCache(), dimensions: 3 })],
    ["dataset", () => ({ ...queryCache(), datasetHash: "0".repeat(64) })],
    ["raw-query key", () => ({ ...queryCache(), queries: { plainQuery: [1, 0] } })],
    ["zero vector", () => ({ ...queryCache(), queries: { [Object.keys(queryCache().queries)[0]]: [0, 0] } })],
    ["nonfinite vector", () => ({ ...queryCache(), queries: { [Object.keys(queryCache().queries)[0]]: [Infinity, 0] } })],
  ])("rejects a query cache with incompatible %s and keeps labelled lexical mode without embedding", async (_label, invalid) => {
    expect(() => validateQueryCache(invalid(), catalog, { model, dimensions: 2 })).toThrow();
    const embed: Embedder = vi.fn(async () => [[1, 0]]);
    const [row] = await evaluateCases(catalog, [evalCase()], { index: sampleIndex(), embeddingModel: model, embeddingDimensions: 2, queryCache: invalid(), embed });
    expect(row.mode).toBe("lexical"); expect(row.warnings.some((warning) => warning.includes("Кеш"))).toBe(true); expect(embed).not.toHaveBeenCalled();
  });

  it("reaches semantic evaluation using a compatible offline raw-query vector cache without network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
    const queryKey = createHash("sha256").update(request().query).digest("hex");
    const queryCache = { schemaVersion: "1.0", model, dimensions: 2, datasetHash: canonicalDatasetHash(catalog), queries: { [queryKey]: [1, 0] } };
    const input = { id: "semantic-unit", kind: "retrieval_positive", now: now.toISOString(), request: request(), labelCriteria: { requiredFacts: [] }, expected: { relevantIds: [catalog.places[0].id], hardEligibleIds: catalog.places.map((poi) => poi.id) } };
    const rows = await evaluateCases(catalog, [input], { index: sampleIndex(), embeddingModel: model, embeddingDimensions: 2, queryCache });
    expect(rows[0].mode).toBe("semantic");
    expect(rows[0].actualTop3[0]).toBe(catalog.places[0].id);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prepares a missing raw-query vector only through a supplied guarded embedder and checkpoints it", async () => {
    const execute = vi.fn(async (args: { purpose: string; quote: { operation: string }; body: unknown }) => {
      expect(args.purpose).toBe("live_eval"); expect(args.quote.operation).toBe("query_embedding");
      expect((args.body as { input: string[] }).input).toEqual(["Кофе"]);
      return { model, data: [{ index: 0, embedding: [1, 0] }] };
    });
    const checkpointQueries = vi.fn(async () => {});
    const input = { id: "prepared-unit", kind: "retrieval_positive", now: now.toISOString(), request: request(), labelCriteria: { requiredFacts: [], anyTags: ["GOLD_MUST_NOT_ENTER"] }, expected: { relevantIds: [catalog.places[0].id], hardEligibleIds: catalog.places.map((poi) => poi.id) } };
    const rows = await evaluateCases(catalog, [input], { index: sampleIndex(), embeddingModel: model, embeddingDimensions: 2, embed: createGuardedEmbedder({ execute }, "live_eval"), checkpointQueries });
    expect(rows[0].mode).toBe("semantic"); expect(execute).toHaveBeenCalledTimes(1); expect(checkpointQueries).toHaveBeenCalledTimes(1);
  });

  it("reuses an unchanged raw query and stops before another dispatch after checkpoint failure", async () => {
    const embed: Embedder = vi.fn(async () => [[1, 0]]);
    const checkpointQueries = vi.fn(async () => {});
    const dependencies = { index: sampleIndex(), embeddingModel: model, embeddingDimensions: 2, embed, checkpointQueries };
    const rows = await evaluateCases(catalog, [evalCase(), { ...evalCase(), id: "same-query" }], dependencies);
    expect(rows.map((row) => row.mode)).toEqual(["semantic", "semantic"]); expect(embed).toHaveBeenCalledTimes(1);
    expect(checkpointQueries).toHaveBeenCalledTimes(1);
    vi.mocked(embed).mockClear();
    await expect(evaluateCases(catalog, [evalCase(), { ...evalCase(), id: "next-query", request: { ...request(), query: "Другая строка" } }], { ...dependencies, checkpointQueries: async () => { throw new Error("STORAGE_FAILED"); } })).rejects.toThrow("QUERY_CHECKPOINT_FAILED");
    expect(embed).toHaveBeenCalledTimes(1);
  });
  it("keeps macro and micro recall distinct and excludes negative guards from positive denominators", () => {
    const rows = [
      { kind: "retrieval_positive", relevantIds: ["a", "b"], actualTop3: ["a"], actualTop5: ["a"], hardConstraintPass: true, negativePass: null, mode: "lexical" },
      { kind: "retrieval_positive", relevantIds: ["c"], actualTop3: ["c"], actualTop5: ["c"], hardConstraintPass: true, negativePass: null, mode: "lexical" },
      { kind: "negative_guard", relevantIds: [], actualTop3: [], actualTop5: [], hardConstraintPass: true, negativePass: true, mode: "lexical" },
    ];
    const summary = summarizeRetrieval(rows);
    expect(summary).toMatchObject({ positiveCases: 2, negativeCases: 1, top3Success: 2, macroRecallAt5: 0.75, negativePassed: 1 });
    expect(summary.microRecallAt5).toBeCloseTo(2 / 3);
    expect(summary.semanticVerified).toBe(false);
  });

  it("does not pass gold tags/names/IDs into retrieval or alter the original query", async () => {
    const input = { id: "unit", kind: "retrieval_positive", now: now.toISOString(), request: request(), labelCriteria: { anyTags: ["GOLD_HINT"], exactName: "GOLD_NAME", requiredFacts: [] }, expected: { relevantIds: [catalog.places[1].id], hardEligibleIds: catalog.places.map((p) => p.id) } };
    const changed = { ...input, labelCriteria: { ...input.labelCriteria, anyTags: ["OTHER_GOLD"], exactName: "OTHER_NAME" } };
    const first = await evaluateCases(catalog, [input]);
    const second = await evaluateCases(catalog, [changed]);
    expect(first[0].actualTop5).toEqual(second[0].actualTop5);
    expect(first[0].query).toBe("Кофе");
  });
});
