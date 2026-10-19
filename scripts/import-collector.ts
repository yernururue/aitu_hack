import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptCollectorSnapshot, CollectorReportSchema } from "../src/lib/data/collector-adapter";

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
function inside(path: string, directory: string) {
  const part = relative(directory, path);
  return !part.startsWith("..") && !part.startsWith("/");
}

export async function main(args: string[]): Promise<number> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (!["--input-dir", "--raw-dir", "--output", "--report", "--slice"].includes(key) || !value || value.startsWith("--") || options.has(key)) {
      console.error("Usage: tsx scripts/import-collector.ts [--input-dir DIR] [--raw-dir DIR] [--output FILE] [--report FILE] [--slice full|reviewed36]");
      return 1;
    }
    options.set(key, value);
  }
  const inputDirectory = resolve(options.get("--input-dir") ?? "data/normalized/astana");
  const rawDirectory = resolve(options.get("--raw-dir") ?? "data/raw/apify");
  const output = resolve(options.get("--output") ?? "data/catalog/places.json");
  const reportPath = resolve(options.get("--report") ?? "data/catalog/import-report.json");
  const slice = options.get("--slice") ?? "full";
  if (!["full", "reviewed36"].includes(slice) || output === reportPath || [output, reportPath].some((path) => inside(path, inputDirectory) || inside(path, rawDirectory))) {
    console.error("Use a supported slice and distinct output paths outside the source directories.");
    return 1;
  }
  try {
    const [placesText, reviewsText, reportText] = await Promise.all(["places.json", "reviews.json", "report.json"].map((file) => readFile(resolve(inputDirectory, file), "utf8")));
    const sourceReport = CollectorReportSchema.parse(JSON.parse(reportText));
    if (!sourceReport.rawSnapshots.length || new Set(sourceReport.rawSnapshots.map((entry) => entry.file)).size !== sourceReport.rawSnapshots.length) throw new Error("missing_or_duplicate_fingerprints");
    const rawReviews: unknown[] = [];
    const checkedRuns = new Set<string>();
    for (const fingerprint of sourceReport.rawSnapshots) {
      const file = resolve(rawDirectory, basename(fingerprint.file));
      const text = await readFile(file, "utf8");
      if (createHash("sha256").update(text).digest("hex") !== fingerprint.sha256) throw new Error("fingerprint_mismatch");
      const records: unknown = JSON.parse(text);
      if (!Array.isArray(records) || records.length !== fingerprint.records) throw new Error("raw_count_mismatch");
      const run = JSON.parse(await readFile(file.replace(/-items\.json$/, "-run.json"), "utf8")) as Record<string, unknown>;
      const recordedRun = sourceReport.runs.find((candidate) => candidate.runId === run.id);
      if (!recordedRun || run.status !== "SUCCEEDED" || run.buildNumber !== recordedRun.buildNumber) throw new Error("unverified_run");
      checkedRuns.add(recordedRun.runId);
      records.forEach((record: unknown) => {
        if (record && typeof record === "object" && "type" in record && record.type === "review") rawReviews.push({ ...record, _runId: run.id });
      });
    }
    if (checkedRuns.size !== sourceReport.runs.length) throw new Error("unverified_run");
    const result = adaptCollectorSnapshot({ places: JSON.parse(placesText), reviews: JSON.parse(reviewsText), rawReviews, report: sourceReport }, { reviewedOnly: slice === "reviewed36" });
    if (!result.report.accepted || (slice === "reviewed36" && !result.report.demoGate.reviewed36Complete)) throw new Error("no_complete_selection");
    result.report.verification = { rawHashesChecked: true, rawCountsChecked: true, collectorRunsChecked: true };
    await writeJson(reportPath, result.report);
    await writeJson(output, result.catalog);
    console.info(`Offline import ${slice}: fetched ${result.report.fetched}; accepted ${result.report.accepted}; rejected ${result.report.rejected}; excerpts ${result.report.reviews.exported}; sha256 ${result.report.catalogSha256}.`);
    return 0;
  } catch {
    // Never echo source payloads, URLs, credentials or upstream errors.
    console.error("Offline import refused: check source fingerprints, successful run metadata and collector data shapes. Existing catalog was not replaced unless validation completed.");
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
