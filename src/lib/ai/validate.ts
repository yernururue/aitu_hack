import { z } from "zod";
import { SourceIdSchema, StableIdSchema } from "../contracts/poi";
import type { RankedPoi } from "../search/rank";

const itemSchema = z.strictObject({
  poiId: StableIdSchema, why: z.string().trim().min(1).max(10_000),
  activity: z.string().trim().min(1).max(10_000),
  evidenceIds: z.array(SourceIdSchema).min(1).max(1000).refine((ids) => new Set(ids).size === ids.length),
});
export const ExplanationSchema = z.strictObject({ items: z.array(itemSchema).max(3) });
export type GeneratedItems = z.infer<typeof ExplanationSchema>["items"];
export type ExplanationItem = GeneratedItems[number];

export function validateExplanation(raw: unknown, candidates: readonly RankedPoi[]): GeneratedItems {
  const { items } = ExplanationSchema.parse(raw);
  if (candidates.length > 8 || (candidates.length > 0 && items.length === 0)) throw new Error("INVALID_EXPLANATION");
  const allowed = new Map(candidates.map((candidate) => [candidate.poi.id, candidate.poi]));
  const seen = new Set<string>();
  for (const item of items) {
    const poi = allowed.get(item.poiId);
    if (!poi || seen.has(item.poiId)) throw new Error("INVALID_EXPLANATION");
    seen.add(item.poiId);
    if (item.evidenceIds.some((id) => !poi.sources.some((source) => source.id === id))) throw new Error("INVALID_EXPLANATION");
    for (const text of [item.why, item.activity]) {
      // Conservatively leave numeric facts, opening times and routes to code.
      if (/[0-9]|https?:|www\.|рейтинг|rating|бесплат|free\b|тенге|\bKZT\b|₸|стоимост|цен[ауы]|открыт|закрыт|координат/iu.test(text)) throw new Error("UNSUPPORTED_FACTUAL_CLAIM");
      // Generated amenity assertions are rejected in either polarity, even when
      // a source mentions the topic or a confirmed fact exists. Facts/opinions
      // remain separate POI data; no substring match is treated as entailment.
      if (/розет|outlet|socket|wi[\s\p{Pd}_]?fi|вай[\s\p{Pd}_]?фай|помещени|indoor|outdoor|inside|дет(?:ск|ей|ям)|child|kid|тих|тишин|шум|quiet|nois|silen/iu.test(text)) throw new Error("GENERATED_AMENITY_CLAIM");
    }
  }
  return items;
}
