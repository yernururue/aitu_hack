import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const projectRoot = process.cwd();
const buildRoot = resolve(projectRoot, ".next");
const requiredCatalog = "data/catalog/places.json";
const requiredIndex = "data/index/places.json";
const requiredPageTrace = ".next/server/app/page.js.nft.json";
const requiredApiTrace = ".next/server/app/api/recommend/route.js.nft.json";
const allowedProjectFiles = new Set(["package.json", requiredCatalog, requiredIndex, "evals/fixtures/places.json"]);

function projectPath(path) {
  return relative(projectRoot, path).split(sep).join("/");
}

async function findTraces(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !["cache", "dev", "standalone"].includes(entry.name)) return findTraces(path);
    return entry.isFile() && entry.name.endsWith(".nft.json") ? [path] : [];
  }));
  return nested.flat();
}

function forbidden(path) {
  return /(^|\/)\.env(?:\.[^/]*)?(?:\/|$)/i.test(path)
    || /^data\/(?:raw|private|normalized|collection)(?:\/|$)/.test(path)
    || /^scripts(?:\/|$)/.test(path);
}

async function main() {
  const traces = await findTraces(buildRoot);
  if (!traces.length) throw new Error("No production NFT traces found; run pnpm build first.");
  const violations = new Set();
  let pageHasCatalog = false;
  let apiHasIndex = false;
  let tracedEntries = 0;
  for (const path of traces) {
    const trace = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(trace.files) || trace.files.some((file) => typeof file !== "string")) {
      throw new Error(`Malformed NFT manifest: ${projectPath(path)}`);
    }
    if (trace.additionalRoots?.length) throw new Error("Additional trace roots require an explicit asset policy.");
    const files = trace.files.map((file) => projectPath(resolve(dirname(path), file.replaceAll("\\", "/"))));
    tracedEntries += files.length;
    if (projectPath(path) === requiredPageTrace) pageHasCatalog = files.includes(requiredCatalog);
    if (projectPath(path) === requiredApiTrace) apiHasIndex = files.includes(requiredIndex);
    for (const file of files) {
      if (forbidden(file)) violations.add(file);
      else if (!file.startsWith("node_modules/") && !file.startsWith(".next/") && !allowedProjectFiles.has(file)) violations.add(file);
    }
  }
  await access(resolve(projectRoot, requiredCatalog));
  try { await access(resolve(projectRoot, requiredIndex)); }
  catch { throw new Error(`Required index asset is missing: ${requiredIndex}.`); }
  if (!pageHasCatalog) throw new Error(`Required catalogue is missing from ${requiredPageTrace}.`);
  if (!apiHasIndex) throw new Error(`Required index is missing from ${requiredApiTrace}.`);
  if (violations.size) {
    console.error(`FAIL: ${violations.size} forbidden or unexpected project assets in production NFT traces.`);
    [...violations].sort().slice(0, 20).forEach((file) => console.error(`  ${file}`));
    if (violations.size > 20) console.error(`  … ${violations.size - 20} more`);
    return 1;
  }
  console.info(`PASS: ${traces.length} production NFT traces, ${tracedEntries} entries; required catalogue/index included, private/source tooling excluded.`);
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : "Build trace check failed."}`);
  process.exitCode = 1;
}
