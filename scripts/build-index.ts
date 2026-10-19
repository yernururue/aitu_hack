import { mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CatalogSchema } from "../src/lib/contracts/poi";
import { loadCatalog } from "../src/lib/data/catalog";
import { createLiveTransport } from "../src/lib/ai/transport";
import { buildIndex, canonicalDatasetHash, createGuardedEmbedder, DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL, EmbeddingCacheSchema, prepareDocuments } from "../src/lib/search/index";

export async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(temporary, { force: true }); }
}

async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try { return await realpath(absolute); }
  catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    return join(await canonicalPath(dirname(absolute)), basename(absolute));
  }
}

export async function protectArtifactPaths(inputs: string[], outputs: string[]) {
  const canonical = await Promise.all([...inputs, ...outputs].map(canonicalPath));
  if (new Set(canonical).size !== canonical.length) throw new Error("PATHS_MUST_BE_DISTINCT");
  return { inputs: canonical.slice(0, inputs.length), outputs: canonical.slice(inputs.length) };
}

export async function main(args: string[]): Promise<number> {
  try {
    const options = new Map<string, string>(); let execute = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--execute" && !execute) { execute = true; continue; }
      if (!["--input", "--output", "--cache", "--model", "--dimensions"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("INVALID_ARGUMENTS");
      options.set(args[i], args[++i]);
    }
    const input = options.get("--input");
    const effectiveInput = input || process.env.APP_DATASET_PATH || (process.env.APP_USE_SYNTHETIC === "true" ? "evals/fixtures/places.json" : "data/catalog/places.json");
    const paths = await protectArtifactPaths([effectiveInput, "evals/real-cases.json"], [options.get("--output") ?? "data/index/places.json", options.get("--cache") ?? "data/index/cache.json"]);
    const [output, cachePath] = paths.outputs;
    const catalog = input ? CatalogSchema.parse(JSON.parse(await readFile(paths.inputs[0], "utf8"))) : await loadCatalog();
    const model = options.get("--model") ?? process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
    const dimensions = Number(options.get("--dimensions") ?? DEFAULT_EMBEDDING_DIMENSIONS);
    const documents = prepareDocuments(catalog);
    if (!execute) {
      console.info(JSON.stringify({ mode: "dry_run", written: false, synthetic: catalog.synthetic, documents: documents.length, documentBytes: documents.reduce((sum, doc) => sum + Buffer.byteLength(doc.text), 0), datasetHash: canonicalDatasetHash(catalog), model, dimensions, status: "Paid indexing requires explicit --execute and enabled guarded transport." }));
      return 0;
    }
    let cache: unknown;
    try { cache = EmbeddingCacheSchema.parse(JSON.parse(await readFile(cachePath, "utf8"))); }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw new Error("CACHE_UNAVAILABLE"); }
    // Factory refuses paid-disabled/unsafe-storage configurations before any request.
    const embed = createGuardedEmbedder(createLiveTransport());
    await writeJsonAtomic(cachePath, EmbeddingCacheSchema.parse(cache ?? { schemaVersion: "1.0", entries: {} }));
    const result = await buildIndex(catalog, { model, dimensions, cache, embed, checkpoint: (checkpoint) => writeJsonAtomic(cachePath, checkpoint) });
    await writeJsonAtomic(output, result.index);
    console.info(JSON.stringify({ mode: "semantic", written: true, model, dimensions, reused: result.reused, embedded: result.embedded, datasetHash: result.index.datasetHash }));
    return 0;
  } catch {
    console.error(JSON.stringify({ mode: "blocked", written: false, message: "Index not written: verify explicit paid authorization, durable budget configuration, compatible cache and normalized catalogue." }));
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
