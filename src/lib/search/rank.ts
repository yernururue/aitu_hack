import type { Coordinates, Poi } from "../contracts/poi";
import type { Intent, ProfileId } from "../contracts/request";
import { haversineMeters } from "../geo";
import { DEMO_RANKING_PROFILES } from "../profiles";
import { estimateVisitMinutes, type VisitMinutes } from "./filters";
import type { Index } from "./index";

export type RankedPoi = { poi: Poi; distanceM: number; score: number; visitMinutes: VisitMinutes };
export type RankingContext = {
  query: string;
  origin: Coordinates;
  intent: Intent;
  now: Date;
  profileId: ProfileId | null;
  savedIds: string[];
  dismissedIds: string[];
  queryVector: number[] | null;
  index: Index | null;
  semanticScores?: Readonly<Record<string, number>>;
};

const categoryWords: Readonly<Record<Poi["category"], string>> = {
  cafe: "cafe coffee кафе кофе кофейня",
  restaurant: "restaurant ресторан еда тамақ",
  park: "park парк саябақ прогулка серуен",
  museum: "museum музей галерея көрме",
  bowling: "bowling боулинг",
  entertainment: "entertainment развлечение развлечения ойын сауық",
  other: "",
};

export function tokenizeSearchText(text: string): string[] {
  return [...new Set(text.normalize("NFKD").toLocaleLowerCase("ru").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) ?? [])];
}

function wordMatch(queryWord: string, documentWord: string): boolean {
  return queryWord === documentWord || (Math.min(queryWord.length, documentWord.length) >= 4
    && (documentWord.startsWith(queryWord) || queryWord.startsWith(documentWord)));
}

function lexicalScore(poi: Poi, query: string, preferredTags: string[]): number {
  const words = tokenizeSearchText(`${query} ${preferredTags.join(" ")}`);
  if (!words.length) return 0;
  const document = tokenizeSearchText(`${poi.name} ${poi.description.text} ${poi.tags.join(" ")} ${categoryWords[poi.category]}`);
  return words.filter((word) => document.some((term) => wordMatch(word, term))).length / words.length;
}

function profileScore(poi: Poi, context: RankingContext, saved: Set<string>): number {
  if (saved.has(poi.id)) return 1;
  if (context.profileId === null) return 0;
  const profile = DEMO_RANKING_PROFILES[context.profileId];
  const category = profile.preferredCategories.includes(poi.category) ? 1 : 0;
  const document = tokenizeSearchText(`${poi.name} ${poi.tags.join(" ")}`);
  const preferredTags = tokenizeSearchText(profile.preferredTags.join(" "));
  const tags = preferredTags.length ? preferredTags.filter((tag) => document.some((word) => wordMatch(tag, word))).length / preferredTags.length : 0;
  const facts = profile.preferredFacts.length
    ? profile.preferredFacts.filter((key) => poi.facts.some((fact) => fact.key === key && fact.value)).length / profile.preferredFacts.length
    : 0;
  return (category + tags + facts) / 3;
}

export function rankCandidates(candidates: Poi[], context: RankingContext): RankedPoi[] {
  if (context.semanticScores) {
    for (const score of Object.values(context.semanticScores)) {
      if (!Number.isFinite(score) || score < 0 || score > 1) throw new RangeError("Semantic scores must be finite numbers between zero and one.");
    }
  }
  const saved = new Set(context.savedIds);
  const dismissed = new Set(context.dismissedIds);
  const ranked: RankedPoi[] = [];
  for (const poi of candidates) {
    if (dismissed.has(poi.id)) continue;
    const visitMinutes = estimateVisitMinutes(poi, context.intent, context.now);
    if (!visitMinutes) continue;
    const distanceM = haversineMeters(context.origin, poi.location);
    const semantic = context.semanticScores && Object.hasOwn(context.semanticScores, poi.id) ? context.semanticScores[poi.id] : 0;
    const lexical = lexicalScore(poi, context.query, context.intent.preferredTags);
    const distance = Math.max(0, 1 - distanceM / context.intent.radiusM);
    const profile = profileScore(poi, context, saved);
    const score = 0.55 * semantic + 0.20 * lexical + 0.15 * distance + 0.10 * profile;
    ranked.push({ poi, distanceM, score, visitMinutes });
  }
  return ranked.sort((a, b) => b.score - a.score || (a.poi.id < b.poi.id ? -1 : a.poi.id > b.poi.id ? 1 : 0));
}
