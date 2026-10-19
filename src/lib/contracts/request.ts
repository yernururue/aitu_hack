import { z } from "zod";
import { CATEGORY_VALUES, CategorySchema, CoordinatesSchema, FACT_KEYS, FactKeySchema, StableIdSchema } from "./poi";

export const RADIUS_OPTIONS = [1000, 2000, 5000] as const;
export const DURATION_OPTIONS = [30, 60, 120] as const;
export const COMPANY_VALUES = ["solo", "couple", "friends", "family"] as const;
export const PROFILE_IDS = ["student", "tourist", "family"] as const;
export const FILTER_KEYS = ["categories", "radiusM", "durationMinutes", "company", "maxSpendKzt", "openNow"] as const;

const unique = <T,>(values: T[]) => new Set(values).size === values.length;
export const ProfileIdSchema = z.enum(PROFILE_IDS);
export type ProfileId = z.infer<typeof ProfileIdSchema>;

export const FiltersSchema = z.strictObject({
  categories: z.array(CategorySchema).max(CATEGORY_VALUES.length).refine(unique, "Duplicate category"),
  radiusM: z.union([z.literal(1000), z.literal(2000), z.literal(5000)]),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  company: z.enum(COMPANY_VALUES),
  maxSpendKzt: z.number().finite().min(0).nullable(),
  openNow: z.boolean(),
});
export type Filters = z.infer<typeof FiltersSchema>;

export const DEFAULT_FILTERS: Readonly<Filters> = {
  categories: [], radiusM: 2000, durationMinutes: 60,
  company: "solo", maxSpendKzt: null, openNow: false,
};

export function createDefaultFilters(): Filters {
  return { ...DEFAULT_FILTERS, categories: [] };
}

export const IntentSchema = z.strictObject({
  ...FiltersSchema.shape,
  requiredFacts: z.array(FactKeySchema).max(FACT_KEYS.length).refine(unique, "Duplicate required fact"),
  preferredTags: z.array(z.string().trim().min(1).max(200)).max(100),
  conflict: z.string().trim().min(1).max(4000).nullable(),
});
export type Intent = z.infer<typeof IntentSchema>;

export const RecommendRequestSchema = z.strictObject({
  query: z.string().max(1000),
  locale: z.enum(["ru", "kk"]),
  location: z.strictObject({ ...CoordinatesSchema.shape, source: z.enum(["device", "preset"]) }),
  filters: FiltersSchema,
  explicitFilterKeys: z.array(z.enum(FILTER_KEYS)).max(FILTER_KEYS.length).refine(unique, "Duplicate explicit filter"),
  profileId: ProfileIdSchema.nullable(),
  savedIds: z.array(StableIdSchema).max(100).refine(unique, "Duplicate saved place"),
  dismissedIds: z.array(StableIdSchema).max(100).refine(unique, "Duplicate dismissed place"),
}).superRefine((request, ctx) => {
  if (!request.query.trim() && request.filters.categories.length === 0) {
    ctx.addIssue({ code: "custom", path: ["query"], message: "Enter a query or choose a category" });
  }
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > 16 * 1024) {
    ctx.addIssue({ code: "custom", message: "Request body exceeds 16KB" });
  }
});
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;
