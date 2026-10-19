import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCatalog } from "../src/lib/data/normalize";

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function main(args: string[]): Promise<number> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!["--input", "--output", "--report"].includes(key) || !value || value.startsWith("--") || options.has(key)) {
      console.error("Usage: tsx scripts/import-poi.ts --input INPUT --output OUTPUT [--report REPORT]");
      return 1;
    }
    options.set(key, value);
  }
  if (!options.has("--input") || !options.has("--output")) {
    console.error("Usage: tsx scripts/import-poi.ts --input INPUT --output OUTPUT [--report REPORT]");
    return 1;
  }
  const input = resolve(options.get("--input")!);
  const output = resolve(options.get("--output")!);
  const reportPath = resolve(options.get("--report") || `${output}.report.json`);
  if (new Set([input, output, reportPath]).size !== 3) {
    console.error("Input, catalogue and report paths must be distinct.");
    return 1;
  }
  try {
    const { catalog, report } = normalizeCatalog(JSON.parse(await readFile(input, "utf8")));
    await writeJson(reportPath, report);
    if (!report.accepted) {
      console.error(`No valid POI accepted; ${report.rejected} rejected. Catalogue was not written.`);
      return 1;
    }
    await writeJson(output, catalog);
    console.info(`Fetched ${report.fetched}; accepted ${report.accepted}; rejected ${report.rejected}; synthetic ${catalog.synthetic}.`);
    return 0;
  } catch {
    console.error("Import failed: input must be a readable normalized catalogue matching the data contract.");
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
