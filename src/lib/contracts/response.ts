import { z } from "zod";
import { HttpsUrlSchema, PoiSchema, SourceIdSchema } from "./poi";
import { IntentSchema, ProfileIdSchema } from "./request";

const VisitMinutesSchema = z.strictObject({
  min: z.number().int().min(5).max(120),
  max: z.number().int().min(5).max(120),
  isEstimate: z.literal(true),
}).refine((duration) => duration.min <= duration.max, { path: ["max"], message: "Maximum visit duration must cover minimum" });

export const RecommendationSchema = z.strictObject({
  poi: PoiSchema,
  distanceM: z.number().finite().min(0),
  distanceKind: z.literal("straight_line"),
  why: z.string().trim().min(1).max(10_000),
  activity: z.string().trim().min(1).max(10_000),
  visitMinutes: VisitMinutesSchema,
  evidenceIds: z.array(SourceIdSchema).min(1).max(1000),
  navigation: z.strictObject({ twoGis: HttpsUrlSchema.nullable(), googleMaps: HttpsUrlSchema }),
}).superRefine((recommendation, ctx) => {
  const ids = new Set(recommendation.poi.sources.map((source) => source.id));
  recommendation.evidenceIds.forEach((id, index) => {
    if (!ids.has(id)) ctx.addIssue({ code: "custom", path: ["evidenceIds", index], message: "Evidence does not belong to the recommended POI" });
  });
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const RecommendResponseSchema = z.strictObject({
  status: z.enum(["ok", "no_results", "needs_clarification", "degraded"]),
  message: z.string().trim().min(1).max(10_000),
  recommendations: z.array(RecommendationSchema).max(3),
  usedContext: z.strictObject({
    locationLabel: z.string().trim().min(1).max(1000),
    filters: IntentSchema,
    profileId: ProfileIdSchema.nullable(),
    isDemoProfile: z.boolean(),
    dataSnapshot: z.string().trim().min(1).max(2000),
  }),
  warnings: z.array(z.string().trim().min(1).max(4000)).max(100),
}).superRefine((response, ctx) => {
  if (["no_results", "needs_clarification"].includes(response.status) && response.recommendations.length) {
    ctx.addIssue({ code: "custom", path: ["recommendations"], message: "This status cannot carry recommendations" });
  }
  if (response.status === "ok" && response.recommendations.length === 0) {
    ctx.addIssue({ code: "custom", path: ["recommendations"], message: "Use no_results for an empty successful search" });
  }
  const ids = new Set<string>();
  response.recommendations.forEach((recommendation, index) => {
    if (ids.has(recommendation.poi.id)) ctx.addIssue({ code: "custom", path: ["recommendations", index, "poi", "id"], message: "Duplicate recommendation" });
    ids.add(recommendation.poi.id);
    if (recommendation.visitMinutes.max > response.usedContext.filters.durationMinutes) {
      ctx.addIssue({ code: "custom", path: ["recommendations", index, "visitMinutes", "max"], message: "Visit duration exceeds the requested limit" });
    }
  });
  if (response.usedContext.profileId !== null && !response.usedContext.isDemoProfile) {
    ctx.addIssue({ code: "custom", path: ["usedContext", "isDemoProfile"], message: "Demo profile usage must be labelled" });
  }
});
export type RecommendResponse = z.infer<typeof RecommendResponseSchema>;
