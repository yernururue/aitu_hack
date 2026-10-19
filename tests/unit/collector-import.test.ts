import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogSchema } from "@/lib/contracts/poi";
import { adaptCollectorSnapshot } from "@/lib/data/collector-adapter";

// These deliberately invented records are unit fixtures only, never catalogue data.
function fixture() {
  const place = {
    placeId: "123", name: "Synthetic test cafe", source: "2gis", sourceRunIds: ["test-run"],
    primaryCategory: "Кофейни", categories: ["Кофейни"], city: "Астана", region: "Астана", district: "Нура район",
    latitude: 51.13, longitude: 71.4, fullName: "Synthetic test cafe, кофейня", address: null as string | null,
    rating: null as number | null, ratingCount: null as number | null, scrapedAt: "2026-10-19T18:00:00Z",
    openingHours: null as Record<string, string[]> | null, timezoneOffsetMin: 300,
    attributes: ["Чек 6000 ₸", "Детское меню"], websites: ["http://example.com"],
    socialLinks: [{ type: "instagram", url: "https://instagram.com/test_cafe" }],
    url: "https://2gis.kz/astana/firm/123",
    phones: ["PRIVATE_PHONE"], emails: ["PRIVATE_EMAIL"], photoUrls: ["PRIVATE_PHOTO"],
  };
  const review = {
    placeId: "123", reviewId: "100", text: "Исходное мнение посетителя.", provider: "2gis",
    date: "2026-10-18T12:00:00Z", scrapedAt: "2026-10-19T18:00:00Z", sourceRunId: "test-run",
  };
  return {
    places: [place], reviews: [review],
    rawReviews: [{ ...review, type: "review", _runId: "test-run", dateCreated: review.date, placeUrl: place.url, likesCount: 3, author: "PRIVATE_AUTHOR" }],
    report: {
      generatedAt: "2026-10-19T18:00:00Z", synthetic: false,
      runs: [{ runId: "test-run", datasetId: "test-dataset", status: "SUCCEEDED", buildNumber: "0.1.13" }],
      rawSnapshots: [] as { file: string; sha256: string; records: number }[],
      counters: { fetchedItems: 2, acceptedPlaces: 1, acceptedReviews: 1, quarantined: 0 },
    },
  };
}

async function adapt(input: unknown = fixture()) {
  return adaptCollectorSnapshot(input);
}

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("collector adaptation without fabricated facts", () => {
  it("imports a real-shaped row with resolved provenance and preserves unknown values", async () => {
    const { catalog, report } = await adapt();
    expect(CatalogSchema.parse(catalog)).toMatchObject({ synthetic: false, places: [{ id: "2gis:123", category: "cafe", price: null, rating: null, hours: null, facts: [], address: null }] });
    expect(catalog.places[0].description.sourceIds).toEqual(["2gis:123:listing"]);
    expect(report).toMatchObject({ fetched: 1, accepted: 1, rejected: 0, byZone: { "Нура район": 1 }, missingFields: { price: 1, rating: 1, hours: 1 } });
    expect(JSON.stringify(catalog)).not.toMatch(/PRIVATE_(PHONE|EMAIL|PHOTO|AUTHOR)/);
  });

  it.each([
    ["Боулинг", ["Боулинг", "Развлекательные центры"], "bowling"],
    ["Рестораны", ["Рестораны", "Кофейни"], "restaurant"],
    ["Художественные выставки", ["Художественные выставки"], "museum"],
    ["Парки", ["Парки", "Аттракционы"], "park"],
    ["Фитнес-клубы", ["Фитнес-клубы"], "other"],
    ["Кондитерские изделия", ["Кондитерские изделия", "Кофейни"], "cafe"],
  ])("maps the explicit source category %s", async (primary, categories, expected) => {
    const input = fixture();
    Object.assign(input.places[0], { primaryCategory: primary, categories });
    expect((await adapt(input)).catalog.places[0].category).toBe(expected);
  });

  it("never turns a source average check or a park category into a guaranteed price", async () => {
    const input = fixture();
    Object.assign(input.places[0], { primaryCategory: "Парки", categories: ["Парки"], attributes: ["Чек 6000 ₸", "Wi-Fi для клиентов", "Детское меню"] });
    expect((await adapt(input)).catalog.places[0]).toMatchObject({ price: null, facts: [] });
  });

  it("uses the branch rating and total count independently from sampled opinions", async () => {
    const input = fixture();
    Object.assign(input.places[0], { rating: 4.2, ratingCount: 800, brandRating: 4.9 });
    expect((await adapt(input)).catalog.places[0].rating).toMatchObject({ value: 4.2, count: 800 });
  });

  it("maps source weekdays, midnight, overnight and split shifts", async () => {
    const input = fixture();
    input.places[0].openingHours = { Mon: ["10:00-24:00"], Tue: ["00:00-24:00"], Wed: ["17:00-02:00"], Thu: ["09:00-13:00", "14:00-18:00"], Fri: [], Sat: [], Sun: ["10:00-12:00"] };
    expect((await adapt(input)).catalog.places[0].hours).toMatchObject({ timezone: "Asia/Almaty", weekly: [
      { weekday: 0, opens: "10:00", closes: "12:00", overnight: false },
      { weekday: 1, opens: "10:00", closes: "00:00", overnight: true },
      { weekday: 2, opens: "00:00", closes: "00:00", overnight: true },
      { weekday: 3, opens: "17:00", closes: "02:00", overnight: true },
      { weekday: 4, opens: "09:00", closes: "13:00", overnight: false },
      { weekday: 4, opens: "14:00", closes: "18:00", overnight: false },
    ] });
  });

  it.each([
    ["invalid_coordinate", { latitude: 91 }],
    ["outside_astana", { latitude: 43.2 }],
    ["invalid_listing_url", { url: "https://2gis.kz/almaty/firm/123" }],
    ["invalid_listing_url", { url: "https://2gis.kz/astana/firm/123?token=PRIVATE_TOKEN" }],
    ["invalid_hours", { openingHours: { Mon: ["25:00-26:00"] } }],
    ["invalid_hours", { openingHours: { Mon: ["10:00-12:00"] } }],
    ["invalid_hours", { openingHours: { Mon: ["10:00-10:00"], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] } }],
    ["invalid_provenance", { source: "synthetic" }],
    ["invalid_provenance", { sourceRunIds: ["unknown-run"] }],
  ])("rejects %s with a PII-free reason", async (reason, overrides) => {
    const input = fixture();
    Object.assign(input.places[0], overrides);
    const { catalog, report } = await adapt(input);
    expect(catalog.places).toEqual([]);
    expect(report.rejections[0].reason).toBe(reason);
    expect(JSON.stringify(report)).not.toContain("PRIVATE_TOKEN");
  });

  it("rejects every duplicate source ID but reports nearby distinct IDs without merging", async () => {
    const input = fixture();
    input.places.push({ ...input.places[0] });
    expect((await adapt(input)).report).toMatchObject({ accepted: 0, rejected: 2 });
    input.places[1] = { ...input.places[1], placeId: "456", url: "https://2gis.kz/astana/firm/456" };
    const result = await adapt(input);
    expect(result.catalog.places).toHaveLength(2);
    expect(result.report.suspectedDuplicates).toEqual([{ ids: ["2gis:123", "2gis:456"], reason: "same_name_nearby", distanceM: 0 }]);
  });

  it("rejects synthetic provenance at the snapshot boundary", async () => {
    const input = fixture(); input.report.synthetic = true;
    await expect(adapt(input)).rejects.toThrow();
  });
});

describe("safe display links and literal review excerpts", () => {
  it("drops HTTP sites, credentials, secret query strings, contact channels and spoofed social hosts", async () => {
    const input = fixture();
    input.places[0].websites = ["http://example.com", "https://user:PRIVATE_PASS@example.com", "https://example.com?access_token=PRIVATE_TOKEN"];
    input.places[0].socialLinks.push(
      { type: "instagram", url: "https://instagram.com.evil.test/profile" },
      { type: "whatsapp", url: "https://wa.me/77011234567" },
      { type: "viber", url: "viber://chat?number=77011234567" },
      { type: "telegram", url: "https://t.me/test_cafe?token=PRIVATE_TOKEN" },
    );
    const { catalog, report } = await adapt(input);
    expect(catalog.places[0].links).toEqual({ twoGis: input.places[0].url, website: null, social: [{ label: "instagram", url: "https://instagram.com/test_cafe", sourceIds: ["2gis:123:listing"] }] });
    expect(report.links.rejected).toBe(7);
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_(TOKEN|PASS)|77011234567/);
  });

  it("restores original review page/date/likes using the exact raw record", async () => {
    const poi = (await adapt()).catalog.places[0];
    expect(poi.reviews).toEqual([{ id: "2gis:123:review:100", text: "Исходное мнение посетителя.", publishedAt: "2026-10-18T12:00:00Z", helpfulCount: 3, sourceIds: ["2gis:123:review:100"] }]);
    expect(poi.sources.find((source) => source.kind === "review")).toEqual({ id: "2gis:123:review:100", kind: "review", url: "https://2gis.kz/astana/firm/123", collectedAt: "2026-10-19T18:00:00Z", publishedAt: "2026-10-18T12:00:00Z" });
  });

  it("keeps at most two literal excerpts ending at word boundaries", async () => {
    const input = fixture();
    const text = "Тихое место для чтения и разговора. ".repeat(20).trim();
    input.reviews = [0, 1, 2].map((index) => ({ ...input.reviews[0], reviewId: String(100 + index), text }));
    input.rawReviews = input.reviews.map((review) => ({ ...input.rawReviews[0], ...review, dateCreated: review.date }));
    const { catalog, report } = await adapt(input);
    expect(catalog.places[0].reviews).toHaveLength(2);
    const excerpt = catalog.places[0].reviews[0].text;
    expect(excerpt.length).toBeLessThanOrEqual(240);
    expect(text.startsWith(excerpt)).toBe(true);
    expect(text[excerpt.length]).toBe(" ");
    expect(report.reviews).toMatchObject({ fetched: 3, accepted: 3, exported: 2, omittedByLimit: 1 });
  });

  it("omits an orphan or unmatched review instead of inventing evidence", async () => {
    const input = fixture();
    input.reviews.push({ ...input.reviews[0], placeId: "999", reviewId: "999" });
    input.rawReviews[0].text = "Different source version";
    const { catalog, report } = await adapt(input);
    expect(catalog.places[0].reviews).toEqual([]);
    expect(report.reviews.rejections.map((row) => row.reason)).toEqual(["raw_join_missing", "orphan_review"]);
  });

  it("does not export a contact embedded in a selected opinion", async () => {
    const input = fixture(); input.reviews[0].text = "Напишите private@example.com"; input.rawReviews[0].text = input.reviews[0].text;
    const result = await adapt(input);
    expect(result.catalog.places[0].reviews).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private@example.com");
  });
});

describe("offline collector importer CLI", () => {
  it("checks fingerprints, writes deterministic validated output and refuses changed raw files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aituhack-collector-")); temporaryDirectories.push(directory);
    const inputDirectory = join(directory, "normalized"); const rawDirectory = join(directory, "raw");
    await mkdir(inputDirectory); await mkdir(rawDirectory);
    const input = fixture();
    const rawText = JSON.stringify([{ ...input.places[0], type: "place" }, ...input.rawReviews.map((review) => ({ ...review, _runId: undefined }))]);
    input.report.rawSnapshots = [{ file: "data/raw/apify/test-items.json", sha256: createHash("sha256").update(rawText).digest("hex"), records: 2 }];
    await Promise.all([
      writeFile(join(inputDirectory, "places.json"), JSON.stringify(input.places)),
      writeFile(join(inputDirectory, "reviews.json"), JSON.stringify(input.reviews)),
      writeFile(join(inputDirectory, "report.json"), JSON.stringify(input.report)),
      writeFile(join(rawDirectory, "test-items.json"), rawText),
      writeFile(join(rawDirectory, "test-run.json"), JSON.stringify({ id: "test-run", status: "SUCCEEDED", buildNumber: "0.1.13" })),
    ]);
    const output = join(directory, "catalog.json"); const report = join(directory, "report.json");
    const args = ["--import", "tsx", "scripts/import-collector.ts", "--input-dir", inputDirectory, "--raw-dir", rawDirectory, "--output", output, "--report", report];
    execFileSync(process.execPath, args, { cwd: resolve("."), encoding: "utf8" });
    const first = await readFile(output, "utf8"); const firstReport = await readFile(report, "utf8");
    expect(CatalogSchema.parse(JSON.parse(first)).places).toHaveLength(1);
    expect(JSON.parse(firstReport).catalogSha256).toBe(createHash("sha256").update(first).digest("hex"));
    execFileSync(process.execPath, args, { cwd: resolve("."), encoding: "utf8" });
    expect(await readFile(output, "utf8")).toBe(first);
    expect(await readFile(report, "utf8")).toBe(firstReport);
    await writeFile(join(rawDirectory, "test-items.json"), "[]");
    expect(spawnSync(process.execPath, args, { cwd: resolve("."), encoding: "utf8" }).status).toBe(1);
    expect(await readFile(output, "utf8")).toBe(first);
    input.report.rawSnapshots = [];
    await writeFile(join(inputDirectory, "report.json"), JSON.stringify(input.report));
    expect(spawnSync(process.execPath, args, { cwd: resolve("."), encoding: "utf8" }).status).toBe(1);
    expect(await readFile(output, "utf8")).toBe(first);
  });
});
