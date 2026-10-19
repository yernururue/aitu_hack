// Offline/server-only adapter. Collector payloads never become browser data wholesale.
import { createHash } from "node:crypto";
import { z } from "zod";
import { CatalogSchema, FACT_KEYS, PoiSchema, type Catalog, type Poi } from "../contracts/poi";

export const REVIEWED_PLACE_IDS = [
  "70000001018125528", "70000001028161260", "70000001028350126", "70000001045845865",
  "70000001019586912", "70000001061880425", "70000001093106778", "70000001103456026",
  "70000001036647175", "70000001051323152", "70000001053516024", "70000001069516972",
  "70000001110593680", "70000001018115978", "70000001019586971", "70000001034935544",
  "70000001054626285", "70000001066154559", "70000001082645461", "70000001090532665",
  "70000001092838884", "70000001097635276", "70000001105373239", "70000001105809728",
  "70000001018608940", "70000001093504455", "70000001111237434", "70000001112120314",
  "70000001114229593", "70000001019586873", "70000001032066906", "70000001032873695",
  "70000001050534482", "70000001069411402", "70000001077394652", "70000001080119937",
] as const;

const IsoDate = z.iso.datetime({ offset: true });
const LocalId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const CounterMap = z.record(z.string(), z.number().int().min(0));
export const CollectorReportSchema = z.object({
  generatedAt: IsoDate,
  synthetic: z.literal(false),
  runs: z.array(z.object({ runId: LocalId, datasetId: LocalId, status: z.literal("SUCCEEDED"), buildNumber: z.string().min(1).max(100) })).min(1),
  rawSnapshots: z.array(z.object({ file: z.string().regex(/^data\/raw\/apify\/[a-z0-9-]+-items\.json$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), records: z.number().int().min(0) })),
  counters: CounterMap.optional(),
});
const InputSchema = z.object({ places: z.array(z.unknown()).max(10_000), reviews: z.array(z.unknown()).max(100_000), rawReviews: z.array(z.unknown()).max(200_000), report: CollectorReportSchema });
const PlaceSchema = z.object({
  placeId: z.string().regex(/^[0-9]+$/), name: z.string().trim().min(1).max(1000),
  source: z.literal("2gis"), sourceRunIds: z.array(LocalId).min(1),
  primaryCategory: z.string().max(200).nullable(), categories: z.array(z.string().max(200)).nullable(),
  city: z.string(), region: z.string().nullable().optional(), district: z.string().max(200).nullable(),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  fullName: z.string().max(50_000).nullable().optional(), address: z.string().trim().min(1).max(2000).nullable(),
  rating: z.number().finite().min(0).max(5).nullable(), ratingCount: z.number().int().min(0).nullable(),
  scrapedAt: IsoDate, url: z.string().max(4096), openingHours: z.unknown(), timezoneOffsetMin: z.number().nullable(),
  websites: z.array(z.unknown()), socialLinks: z.array(z.unknown()),
});
const ReviewSchema = z.object({
  placeId: z.string().regex(/^[0-9]+$/), reviewId: LocalId, text: z.string().trim().min(1).max(50_000),
  provider: z.literal("2gis"), date: IsoDate.nullable(), scrapedAt: IsoDate, sourceRunId: LocalId,
});
const RawReviewSchema = z.object({
  placeId: z.union([z.string(), z.number().int()]).transform(String), reviewId: z.union([z.string(), z.number().int()]).transform(String),
  text: z.string().trim().min(1), provider: z.literal("2gis"), dateCreated: IsoDate.nullable(),
  scrapedAt: IsoDate, _runId: LocalId, placeUrl: z.string(), likesCount: z.number().int().min(0).nullable(),
});

type Reason = "invalid_place" | "invalid_coordinate" | "outside_astana" | "invalid_listing_url" | "invalid_hours" | "invalid_provenance" | "invalid_category" | "duplicate_id";
type Rejection = { index: number; id: string | null; reason: string };
type Duplicate = { ids: [string, string]; reason: "same_name_nearby"; distanceM: number };
type Counts = Record<string, number>;

function row(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function safeId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
}
function increment(counts: Counts, key: string) { counts[key] = (counts[key] ?? 0) + 1; }
function label(value: string) { return value.trim().normalize("NFKC").toLocaleLowerCase("ru").replaceAll("ё", "е"); }

const sensitiveQueryName = /token|secret|password|passwd|api.?key|auth|credential|signature|access.?key/i;
function linkProblem(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim() || /[\r\n]/.test(value)) return "invalid_url";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "unsupported_protocol";
    if (url.username || url.password) return "credentials";
    if ([...url.searchParams.keys()].some((key) => sensitiveQueryName.test(key)) || sensitiveQueryName.test(url.hash)) return "sensitive_query";
    return null;
  } catch { return "invalid_url"; }
}
function listingUrl(value: unknown, placeId: string): value is string {
  return typeof value === "string" && !linkProblem(value) && new RegExp(`^https://2gis\\.kz/(?:ru/|kk/)?astana/(?:firm|geo)/${placeId}$`).test(value);
}
const socialHosts: Record<string, string[]> = {
  instagram: ["instagram.com", "www.instagram.com"], facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
  telegram: ["t.me", "telegram.me"], vkontakte: ["vk.com", "www.vk.com"],
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  linkedin: ["linkedin.com", "www.linkedin.com"], twitter: ["twitter.com", "www.twitter.com", "x.com", "www.x.com"],
};

function mapCategory(primary: string | null, categories: string[] | null): Poi["category"] | null {
  const labels = [primary, ...(categories ?? [])].filter((value): value is string => typeof value === "string").map(label);
  for (const value of labels) {
    if (/^боулинг$/.test(value)) return "bowling";
    if (/^(?:кофейн[яи]|точк[аи] кофе|(?:анти)?кафе(?:-кондитерские)?)$/.test(value)) return "cafe";
    if (/^(?:рестораны?|пиццери[яи]|суши-бары?|быстрое питание)$/.test(value)) return "restaurant";
    if (/^(?:парки?|скверы?|(?:ботанические )?сады?|набережн(?:ая|ые))$/.test(value)) return "park";
    if (/^(?:музе[йи]|(?:художественные |картинные |арт-)?галере[яи]|художественные выставки)$/.test(value)) return "museum";
    if (/^(?:развлекательные центры|кинотеатры?|квесты?|бильярдные залы|аттракционы?|батутные центры|компьютерные клубы|клубы видеоигр|(?:детские )?игровые залы|каток|катки|стадионы?|клубы настольного тенниса|сквош-корты|спортивно-тактические клубы|спортивные секции|бассейны|картинг|караоке-залы)$/.test(value)) return "entertainment";
  }
  return labels.some((value) => /^(?:тренажерные залы|фитнес(?:-клубы|-центры)?|спортивные (?:клубы|залы)|центры йоги|коворкинг(?:и)?)$/.test(value)) ? "other" : null;
}

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function mapHours(value: unknown, offset: number | null, sourceId: string): Poi["hours"] {
  if (value === null) return null;
  const source = row(value);
  if (!source || offset !== 300 || Object.keys(source).length !== 7 || days.some((day) => !Array.isArray(source[day]))) throw new Error("invalid_hours");
  const weekly: NonNullable<Poi["hours"]>["weekly"] = [];
  days.forEach((day, weekday) => {
    for (const interval of source[day] as unknown[]) {
      if (typeof interval !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d-(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(interval)) throw new Error("invalid_hours");
      const [opens, originalClose] = interval.split("-");
      if (opens === originalClose) throw new Error("invalid_hours");
      const closes = originalClose === "24:00" ? "00:00" : originalClose;
      weekly.push({ weekday, opens, closes, overnight: originalClose === "24:00" || opens > closes });
    }
  });
  return { timezone: "Asia/Almaty", weekly, sourceIds: [sourceId] };
}

function excerpt(text: string): string | null {
  if (text.length <= 240) return text;
  if (/\s/.test(text[240])) return text.slice(0, 240).trimEnd();
  const boundary = text.slice(0, 241).search(/\s+\S*$/);
  return boundary > 0 ? text.slice(0, boundary).trimEnd() : null;
}
const contactText = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?<!\d)(?:\+7|8)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}(?!\d)/i;
function reviewKey(value: { provider: string; reviewId: string; placeId: string; text: string; scrapedAt: string }, runId: string, date: string | null) {
  return JSON.stringify([value.provider, value.reviewId, value.placeId, runId, value.scrapedAt, value.text.trim(), date]);
}

function nearbyDuplicates(places: Poi[]): Duplicate[] {
  const result: Duplicate[] = [];
  places.forEach((first, index) => {
    places.slice(index + 1).forEach((second) => {
      if (label(first.name).replace(/[^\p{L}\p{N}]/gu, "") !== label(second.name).replace(/[^\p{L}\p{N}]/gu, "")) return;
      const rad = Math.PI / 180;
      const dLat = (second.location.lat - first.location.lat) * rad; const dLon = (second.location.lon - first.location.lon) * rad;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(first.location.lat * rad) * Math.cos(second.location.lat * rad) * Math.sin(dLon / 2) ** 2;
      const distanceM = 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
      if (distanceM <= 50) result.push({ ids: [first.id, second.id], reason: "same_name_nearby", distanceM: Math.round(distanceM * 10) / 10 });
    });
  });
  return result;
}

function distributions(places: Poi[], districts: Map<string, string>) {
  const byCategory: Counts = {}; const byZone: Counts = {};
  places.forEach((poi) => { increment(byCategory, poi.category); increment(byZone, districts.get(poi.id) ?? "unknown"); });
  return { byCategory, byZone };
}

export function adaptCollectorSnapshot(raw: unknown, options: { reviewedOnly?: boolean } = {}) {
  const input = InputSchema.parse(raw);
  const knownRuns = new Set(input.report.runs.map((run) => run.runId));
  if (knownRuns.size !== input.report.runs.length) throw new Error("Duplicate collector run ID");
  const reviewedIds = new Set<string>(REVIEWED_PLACE_IDS);
  const inputPlaceIds = new Set(input.places.map((value) => safeId(row(value)?.placeId)).filter(Boolean));
  const selected = input.places.filter((value) => !options.reviewedOnly || reviewedIds.has(String(row(value)?.placeId)));
  const idCounts = new Map<string, number>();
  selected.forEach((value) => { const id = safeId(row(value)?.placeId); if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1); });
  const rejections: Rejection[] = [];
  const places: Poi[] = []; const districts = new Map<string, string>();
  const categoryMappings: { id: string; category: Poi["category"]; primaryMatched: boolean }[] = [];
  const links = { fetched: 0, acceptedWebsites: 0, acceptedSocial: 0, rejected: 0, omittedAdditionalWebsites: 0, reasons: {} as Counts };
  const rejectLink = (reason: string) => { links.rejected++; increment(links.reasons, reason); };

  selected.forEach((value, index) => {
    const object = row(value); const id = safeId(object?.placeId);
    const reject = (reason: Reason) => rejections.push({ index, id, reason });
    if (id && idCounts.get(id)! > 1) return void reject("duplicate_id");
    if (object?.source !== "2gis" || !Array.isArray(object.sourceRunIds) || !object.sourceRunIds.length || object.sourceRunIds.some((run) => typeof run !== "string" || !knownRuns.has(run))) return void reject("invalid_provenance");
    const coordinates = [object?.latitude, object?.longitude];
    if (coordinates.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate)) || Math.abs(Number(coordinates[0])) > 90 || Math.abs(Number(coordinates[1])) > 180) return void reject("invalid_coordinate");
    if (!id || !listingUrl(object?.url, id)) return void reject("invalid_listing_url");
    const parsed = PlaceSchema.safeParse(value);
    if (!parsed.success) return void reject("invalid_place");
    const place = parsed.data;
    if (!["астана", "astana"].includes(label(place.city)) || (place.region && !["астана", "astana", "г. астана", "город астана", "astana city"].includes(label(place.region))) || !(place.latitude >= 50.9 && place.latitude <= 51.3 && place.longitude >= 71.2 && place.longitude <= 71.7)) return void reject("outside_astana");
    if (Date.parse(place.scrapedAt) > Date.parse(input.report.generatedAt)) return void reject("invalid_provenance");
    const category = mapCategory(place.primaryCategory, place.categories);
    if (!category) return void reject("invalid_category");
    const poiId = `2gis:${place.placeId}`; const listingSourceId = `${poiId}:listing`;
    let hours: Poi["hours"];
    try { hours = mapHours(place.openingHours, place.timezoneOffsetMin, listingSourceId); } catch { return void reject("invalid_hours"); }
    let website: string | null = null;
    place.websites.forEach((url) => {
      links.fetched++;
      const problem = linkProblem(url);
      if (problem) return rejectLink(problem);
      if (website) { links.omittedAdditionalWebsites++; return; }
      website = url as string; links.acceptedWebsites++;
    });
    const social: Poi["links"]["social"] = [];
    const socialSeen = new Set<string>();
    place.socialLinks.forEach((value) => {
      links.fetched++;
      const item = row(value);
      if (!item || typeof item.type !== "string") return rejectLink("invalid_social");
      const type = label(item.type);
      if (["whatsapp", "viber"].includes(type)) return rejectLink("contact_channel");
      const problem = linkProblem(item.url);
      if (problem) return rejectLink(problem);
      const url = new URL(item.url as string);
      if (!socialHosts[type]?.includes(url.hostname) || url.port || contactText.test(url.pathname)) return rejectLink("unsupported_social_host_or_contact");
      if (socialSeen.has(item.url as string)) return rejectLink("duplicate_social_url");
      socialSeen.add(item.url as string); social.push({ label: type, url: item.url as string, sourceIds: [listingSourceId] }); links.acceptedSocial++;
    });
    const poi = PoiSchema.safeParse({
      id: poiId, name: place.name, location: { lat: place.latitude, lon: place.longitude }, category,
      description: { text: place.fullName?.trim() || [place.name, ...(place.categories ?? [])].join(", "), sourceIds: [listingSourceId] },
      tags: [...new Set((place.categories ?? []).map(label).filter(Boolean))], address: place.address,
      rating: place.rating !== null && place.ratingCount !== null ? { value: place.rating, count: place.ratingCount, sourceIds: [listingSourceId] } : null,
      price: null, facts: [], hours, links: { twoGis: place.url, website, social }, reviews: [],
      sources: [{ id: listingSourceId, kind: "listing", url: place.url, collectedAt: place.scrapedAt, publishedAt: null }],
    });
    if (!poi.success) return void reject("invalid_place");
    places.push(poi.data); districts.set(poiId, place.district || "unknown");
    categoryMappings.push({ id: poiId, category, primaryMatched: mapCategory(place.primaryCategory, null) === category });
  });
  places.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const placesById = new Map(places.map((place) => [place.id.slice(5), place]));
  const rawReviews = new Map<string, z.infer<typeof RawReviewSchema>[]>();
  input.rawReviews.forEach((value) => {
    const parsed = RawReviewSchema.safeParse(value);
    if (!parsed.success) return;
    const review = parsed.data; const key = reviewKey(review, review._runId, review.dateCreated);
    rawReviews.set(key, [...(rawReviews.get(key) ?? []), review]);
  });
  const reviews = { fetched: 0, accepted: 0, rejected: 0, matchedRaw: 0, exported: 0, omittedByLimit: 0, omittedBySlice: 0, rejections: [] as Rejection[] };
  const reviewIdCounts = new Map<string, number>();
  input.reviews.forEach((value) => {
    const object = row(value); const id = safeId(object?.reviewId);
    if (id) reviewIdCounts.set(id, (reviewIdCounts.get(id) ?? 0) + 1);
  });
  input.reviews.forEach((value, index) => {
    const object = row(value); const id = safeId(object?.reviewId); const pid = safeId(object?.placeId);
    if (options.reviewedOnly && pid && inputPlaceIds.has(pid) && !reviewedIds.has(pid)) { reviews.omittedBySlice++; return; }
    reviews.fetched++;
    const reject = (reason: string) => { reviews.rejected++; reviews.rejections.push({ index, id, reason }); };
    if (!pid || !placesById.has(pid)) return reject("orphan_review");
    const parsed = ReviewSchema.safeParse(value);
    if (!parsed.success) return reject("invalid_review");
    const review = parsed.data;
    if (id && reviewIdCounts.get(id)! > 1) return reject("duplicate_review_id");
    if (!knownRuns.has(review.sourceRunId) || Date.parse(review.scrapedAt) > Date.parse(input.report.generatedAt) || (review.date && Date.parse(review.date) > Date.parse(review.scrapedAt))) return reject("invalid_review_provenance");
    const candidates = rawReviews.get(reviewKey(review, review.sourceRunId, review.date)) ?? [];
    if (candidates.length !== 1) return reject(candidates.length ? "raw_join_ambiguous" : "raw_join_missing");
    const original = candidates[0];
    if (!listingUrl(original.placeUrl, pid)) return reject("invalid_review_url");
    reviews.matchedRaw++;
    if (contactText.test(review.text)) return reject("contact_in_review");
    const text = excerpt(review.text);
    if (!text) return reject("excerpt_without_word_boundary");
    reviews.accepted++;
    const poi = placesById.get(pid)!;
    if (poi.reviews.length === 2) { reviews.omittedByLimit++; return; }
    const sourceId = `2gis:${pid}:review:${review.reviewId}`;
    poi.sources.push({ id: sourceId, kind: "review", url: original.placeUrl, collectedAt: review.scrapedAt, publishedAt: review.date });
    poi.reviews.push({ id: sourceId, text, publishedAt: review.date, helpfulCount: original.likesCount, sourceIds: [sourceId] });
    reviews.exported++;
  });
  const catalog: Catalog = CatalogSchema.parse({ schemaVersion: "1.0", synthetic: false, places });
  const missingFields: Counts = {}; const bySource: Counts = {};
  catalog.places.forEach((poi) => {
    for (const key of ["address", "rating", "price", "hours"] as const) if (poi[key] === null) increment(missingFields, key);
    for (const key of ["twoGis", "website"] as const) if (poi.links[key] === null) increment(missingFields, `links.${key}`);
    if (!poi.reviews.length) increment(missingFields, "reviews");
    if (!poi.links.social.length) increment(missingFields, "links.social");
    FACT_KEYS.forEach((key) => { if (!poi.facts.some((fact) => fact.key === key)) increment(missingFields, `facts.${key}`); });
    new Set(poi.sources.map((source) => source.kind)).forEach((kind) => increment(bySource, kind));
  });
  const reviewedPlaces = catalog.places.filter((poi) => reviewedIds.has(poi.id.slice(5)));
  const reviewedSlice = { requested: REVIEWED_PLACE_IDS.length, accepted: reviewedPlaces.length, missingIds: REVIEWED_PLACE_IDS.filter((id) => !placesById.has(id)), ...distributions(reviewedPlaces, districts) };
  const distribution = distributions(catalog.places, districts);
  return { catalog, report: {
    schemaVersion: "1.0", sourceSnapshot: input.report.generatedAt, selection: options.reviewedOnly ? "reviewed36" : "full",
    synthetic: false, fetched: selected.length, accepted: places.length, rejected: rejections.length, rejections,
    inputCounts: { normalizedPlaces: input.places.length, normalizedReviews: input.reviews.length, rawReviews: input.rawReviews.length, upstream: input.report.counters ?? {} },
    provenance: { runs: input.report.runs, rawSnapshots: input.report.rawSnapshots },
    verification: { rawHashesChecked: false, rawCountsChecked: false, collectorRunsChecked: false },
    catalogSha256: createHash("sha256").update(`${JSON.stringify(catalog, null, 2)}\n`).digest("hex"),
    suspectedDuplicates: nearbyDuplicates(catalog.places), missingFields, bySource, ...distribution, categoryMappings, links, reviews, reviewedSlice,
    demoGate: { atLeast30: places.length >= 30, atLeast3Zones: Object.keys(distribution.byZone).length >= 3 && !distribution.byZone.unknown, atLeast3Categories: Object.keys(distribution.byCategory).length >= 3, reviewed36Complete: reviewedPlaces.length === REVIEWED_PLACE_IDS.length },
    limitations: ["Local demonstration; publication rights for source reviews are not established.", "Reviews are literal excerpts of a relevance sample, with branch-page source URLs; no review permalink was verified.", "Price and factual amenities remain unknown; unknown hours remain null.", "Source districts are not an independently verified administrative polygon."],
  } };
}
