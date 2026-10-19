import { z } from "zod";

export const CATEGORY_VALUES = ["cafe", "restaurant", "park", "museum", "bowling", "entertainment", "other"] as const;
export const FACT_KEYS = ["quiet", "outlets", "wifi", "childFriendly", "indoor"] as const;
export const SOURCE_KINDS = ["listing", "official", "social", "review", "synthetic"] as const;

export const CategorySchema = z.enum(CATEGORY_VALUES);
export const FactKeySchema = z.enum(FACT_KEYS);
export type FactKey = z.infer<typeof FactKeySchema>;

export const StableIdSchema = z.string().max(256).regex(/^[a-z0-9][a-z0-9_-]*:[^\s]+$/i, "Expected a namespaced stable ID");
export const SourceIdSchema = z.string().min(1).max(512).regex(/^\S+$/);
const SourceIdsSchema = z.array(SourceIdSchema).min(1).max(1000).refine((ids) => new Set(ids).size === ids.length, "Duplicate source reference");
const IsoTimeSchema = z.iso.datetime({ offset: true });

function urlWithProtocols(protocols: readonly string[]) {
  return z.string().max(4096).url().refine((value) => {
    try {
      const url = new URL(value);
      return protocols.includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Unsupported URL protocol or credentials");
}

export const HttpsUrlSchema = urlWithProtocols(["https:"]);
const ProvenanceUrlSchema = urlWithProtocols(["http:", "https:"]);

export const CoordinatesSchema = z.strictObject({
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

const SourceSchema = z.strictObject({
  id: SourceIdSchema,
  kind: z.enum(SOURCE_KINDS),
  url: ProvenanceUrlSchema,
  collectedAt: IsoTimeSchema,
  publishedAt: IsoTimeSchema.nullable(),
});

const RatingSchema = z.strictObject({
  value: z.number().finite().min(0).max(5),
  count: z.number().int().min(0),
  sourceIds: SourceIdsSchema,
});

const PriceSchema = z.strictObject({
  min: z.number().finite().min(0),
  max: z.number().finite().min(0),
  currency: z.literal("KZT"),
  basis: z.literal("per_person_visit"),
  sourceIds: SourceIdsSchema,
}).refine((price) => price.max >= price.min, { path: ["max"], message: "Maximum price must cover minimum price" });

const ClockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const IntervalSchema = z.strictObject({
  weekday: z.number().int().min(0).max(6),
  opens: ClockSchema,
  closes: ClockSchema,
  overnight: z.boolean(),
}).refine((interval) => interval.overnight || interval.closes > interval.opens, {
  path: ["closes"], message: "Same-day closing time must follow opening time",
});

const HoursSchema = z.strictObject({
  timezone: z.literal("Asia/Almaty"),
  weekly: z.array(IntervalSchema).max(100),
  sourceIds: SourceIdsSchema,
});

const FactSchema = z.strictObject({
  key: FactKeySchema,
  value: z.boolean(),
  confidence: z.enum(["confirmed", "reported"]),
  sourceIds: SourceIdsSchema,
});

const SocialSchema = z.strictObject({
  label: z.string().min(1).max(200),
  url: HttpsUrlSchema,
  sourceIds: SourceIdsSchema,
});

const ReviewSchema = z.strictObject({
  id: SourceIdSchema,
  text: z.string().min(1).max(50_000),
  publishedAt: IsoTimeSchema.nullable(),
  helpfulCount: z.number().int().min(0).nullable(),
  sourceIds: SourceIdsSchema,
});

export const PoiSchema = z.strictObject({
  id: StableIdSchema,
  name: z.string().trim().min(1).max(1000),
  location: CoordinatesSchema,
  category: CategorySchema,
  description: z.strictObject({ text: z.string().max(50_000), sourceIds: SourceIdsSchema }),
  tags: z.array(z.string().trim().min(1).max(200)).max(200),
  address: z.string().trim().min(1).max(2000).nullable(),
  rating: RatingSchema.nullable(),
  price: PriceSchema.nullable(),
  facts: z.array(FactSchema).max(100).refine(
    (facts) => new Set(facts.map((fact) => fact.key)).size === facts.length,
    "Duplicate fact key",
  ),
  hours: HoursSchema.nullable(),
  links: z.strictObject({ twoGis: HttpsUrlSchema.nullable(), website: HttpsUrlSchema.nullable(), social: z.array(SocialSchema).max(100) }),
  reviews: z.array(ReviewSchema).max(1000),
  sources: z.array(SourceSchema).min(1).max(2000),
}).superRefine((poi, ctx) => {
  const sourceIds = new Set<string>();
  poi.sources.forEach((source, index) => {
    if (sourceIds.has(source.id)) ctx.addIssue({ code: "custom", path: ["sources", index, "id"], message: "Duplicate source ID" });
    sourceIds.add(source.id);
  });

  function checkReferences(ids: string[], path: (string | number)[]) {
    ids.forEach((id, index) => {
      if (!sourceIds.has(id)) ctx.addIssue({ code: "custom", path: [...path, index], message: "Source reference does not belong to this POI" });
    });
  }
  checkReferences(poi.description.sourceIds, ["description", "sourceIds"]);
  if (poi.rating) checkReferences(poi.rating.sourceIds, ["rating", "sourceIds"]);
  if (poi.price) checkReferences(poi.price.sourceIds, ["price", "sourceIds"]);
  if (poi.hours) checkReferences(poi.hours.sourceIds, ["hours", "sourceIds"]);
  poi.facts.forEach((fact, index) => checkReferences(fact.sourceIds, ["facts", index, "sourceIds"]));
  poi.links.social.forEach((social, index) => checkReferences(social.sourceIds, ["links", "social", index, "sourceIds"]));
  const reviewIds = new Set<string>();
  poi.reviews.forEach((review, index) => {
    checkReferences(review.sourceIds, ["reviews", index, "sourceIds"]);
    if (reviewIds.has(review.id)) ctx.addIssue({ code: "custom", path: ["reviews", index, "id"], message: "Duplicate review ID" });
    reviewIds.add(review.id);
  });
});
export type Poi = z.infer<typeof PoiSchema>;

export const CatalogSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  synthetic: z.boolean(),
  places: z.array(PoiSchema).max(10_000),
}).superRefine((catalog, ctx) => {
  const ids = new Set<string>();
  catalog.places.forEach((poi, index) => {
    if (ids.has(poi.id)) ctx.addIssue({ code: "custom", path: ["places", index, "id"], message: "Duplicate place ID" });
    ids.add(poi.id);
    if (!catalog.synthetic && poi.sources.some((source) => source.kind === "synthetic")) {
      ctx.addIssue({ code: "custom", path: ["places", index, "sources"], message: "Synthetic provenance is forbidden in a real catalogue" });
    }
  });
});
export type Catalog = z.infer<typeof CatalogSchema>;
