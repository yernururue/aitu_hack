import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

const checker = resolve("scripts/check-build-trace.mjs");
const pageTrace = ".next/server/app/page.js.nft.json";
const apiTrace = ".next/server/app/api/recommend/route.js.nft.json";
let directory: string;
async function file(path: string, content: unknown = {}) {
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(join(directory, path), JSON.stringify(content));
}
async function trace(path: string, assets: string[]) {
  await file(path, { version: 1, files: assets.map((asset) => relative(dirname(join(directory, path)), join(directory, asset))) });
}
async function fixture(includeIndex = true) {
  // Asset tracing fixtures only. Index compatibility is a separate data-layer gate.
  await file("data/catalog/places.json");
  if (includeIndex) await file("data/index/places.json");
  await trace(pageTrace, ["data/catalog/places.json"]);
  await trace(apiTrace, ["data/catalog/places.json", ...(includeIndex ? ["data/index/places.json"] : [])]);
}
function check(args: string[] = []) {
  const result = spawnSync(process.execPath, [checker, ...args], { cwd: directory, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "aituhack-nft-policy-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("narrow production index asset policy", () => {
  it("declares only the exact accepted index asset for the recommendation route", () => {
    expect(nextConfig.outputFileTracingIncludes?.["/api/recommend"]).toEqual(["./data/index/places.json"]);
    expect(Object.values(nextConfig.outputFileTracingIncludes ?? {}).flat().filter((path) => path.includes("data/index"))).toEqual(["./data/index/places.json"]);
  });
  it("accepts catalogue and exact index inclusion without private assets", async () => {
    await fixture();
    expect(check()).toMatchObject({ status: 0 });
    expect(check(["--require-index"])).toMatchObject({ status: 0 });
  });
  it("accepts a clean offline catalogue-only build by default but rejects its strict index gate", async () => {
    await fixture(false);
    expect(check()).toMatchObject({ status: 0 });
    const strict = check(["--require-index"]);
    expect(strict.status).toBe(1); expect(strict.output).toMatch(/index.*missing|missing.*index/i);
  });
  it("rejects a build with no index in the actual recommendation trace", async () => {
    await fixture(); await trace(apiTrace, ["data/catalog/places.json"]);
    const result = check(["--require-index"]); expect(result.status).toBe(1); expect(result.output).toMatch(/index.*missing|missing.*index/i);
  });
  it("rejects index presence elsewhere when the recommendation route trace is absent", async () => {
    await fixture(); await rm(join(directory, apiTrace)); await trace(pageTrace, ["data/catalog/places.json", "data/index/places.json"]);
    const result = check(["--require-index"]); expect(result.status).toBe(1); expect(result.output).toMatch(/index.*missing|missing.*index/i);
  });
  it("rejects a trace reference when the actual index asset is absent", async () => {
    await fixture(); await rm(join(directory, "data/index/places.json"));
    expect(check(["--require-index"]).status).toBe(1);
  });
  it.each(["data/index/cache.json", "data/index/query-vectors.json", "data/index/queries/private.json", "data/index/places.backup.json", "data/private/ledger.json", "data/raw/source.json", "data/normalized/source.json", "data/collection/private.json", ".env.local", "scripts/collector.ts"])("rejects private or unaccepted asset %s", async (asset) => {
    await fixture(); await file(asset); await trace(apiTrace, ["data/catalog/places.json", "data/index/places.json", asset]);
    const result = check(); expect(result.status).toBe(1); expect(result.output).toContain(asset);
  });
  it.each(["data/index/cache.json", "data/private/ledger.json"])("still rejects %s from an index-free offline trace", async (asset) => {
    await fixture(false); await file(asset); await trace(apiTrace, ["data/catalog/places.json", asset]);
    const result = check(); expect(result.status).toBe(1); expect(result.output).toContain(asset);
  });
  it.each(["data/index/query-vectors.json", "data/private/ledger.json"])("still rejects %s in strict index mode", async (asset) => {
    await fixture(); await file(asset); await trace(apiTrace, ["data/catalog/places.json", "data/index/places.json", asset]);
    const result = check(["--require-index"]); expect(result.status).toBe(1); expect(result.output).toContain(asset);
  });
  it.each([
    { args: ["--unknown"] }, { args: ["--require-index=false"] },
    { args: ["--require-index", "--require-index"] }, { args: ["require-index"] },
  ])("fails closed for invalid CLI arguments $args", async ({ args }) => {
    await fixture();
    const result = check(args); expect(result.status).toBe(1); expect(result.output).toContain("Usage:");
  });
});
