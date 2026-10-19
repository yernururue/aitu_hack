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

const requestWords = new Set(tokenizeSearchText(`
  а и или но в во на у с со к ко от до для по о об за из при
  я мы мне нам где это этот есть нужен нужна нужно нужны хочется хочу хотим
  найди найдите покажи покажите ищу ищем зайду зайдем сходить сходим пойдем стартую стартуем
  рядом недалеко около примерно возле пределах дальше дольше максимум минимум именно
  один одна одну одному одного два двух двое вдвоем три трех четыре пять пяти шесть
  километр километра километре километров километрах метра метров метрах
  минут минуту минуты минутах час часа часов часе полчаса получаса времени посещение посещения
`));

function lexicalTerm(word: string): string {
  // Inflection equivalence, not arbitrary shared prefixes. Keep short stems and
  // words with distinct Kazakh letters intact; exact Unicode matching survives.
  if (!/^[а-я]+$/u.test(word)) return word;
  const stem = word.replace(/(?:иями|ями|ами|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ыи|ии|ои|ую|юю|ах|ях|ов|ев|ам|ям|ом|ем|ы|и|а|я|у|ю|е)$/u, "");
  return stem.length >= 4 ? stem : word;
}

function lexicalDocument(poi: Poi): Set<string> {
  return new Set(tokenizeSearchText(`${poi.name} ${poi.description.text} ${poi.tags.join(" ")} ${categoryWords[poi.category]}`).map(lexicalTerm));
}

function lexicalQuery(query: string, preferredTags: string[], documents: Set<string>[]): string[] {
  const quoted = new Set([...query.matchAll(/«([^»]*)»|"([^"]*)"|“([^”]*)”|'([^']*)'|‘([^’]*)’/gu)]
    .flatMap((match) => tokenizeSearchText(match.slice(1).find((part) => part !== undefined) ?? "")));
  const content = tokenizeSearchText(query).filter((word) => quoted.has(word) || (!requestWords.has(word) && !/^\d+$/u.test(word)));
  const terms = [...new Set([...content, ...tokenizeSearchText(preferredTags.join(" "))].map(lexicalTerm))];
  const supported = new Set(documents.flatMap((document) => [...document]));
  // Unknown origin names and request context supply no lexical evidence. They
  // must not dilute a source-supported subtype/name match in a longer request.
  return terms.filter((term) => supported.has(term));
}

function lexicalScore(document: Set<string>, words: string[]): number {
  return words.length ? words.filter((word) => document.has(word)).length / words.length : 0;
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
  const eligible = candidates.flatMap((poi) => {
    if (dismissed.has(poi.id)) return [];
    const visitMinutes = estimateVisitMinutes(poi, context.intent, context.now);
    return visitMinutes ? [{ poi, visitMinutes, document: lexicalDocument(poi) }] : [];
  });
  const words = lexicalQuery(context.query, context.intent.preferredTags, eligible.map((item) => item.document));
  const ranked: RankedPoi[] = [];
  for (const { poi, visitMinutes, document } of eligible) {
    const distanceM = haversineMeters(context.origin, poi.location);
    const semantic = context.semanticScores && Object.hasOwn(context.semanticScores, poi.id) ? context.semanticScores[poi.id] : 0;
    const lexical = lexicalScore(document, words);
    const distance = Math.max(0, 1 - distanceM / context.intent.radiusM);
    const profile = profileScore(poi, context, saved);
    const score = 0.55 * semantic + 0.20 * lexical + 0.15 * distance + 0.10 * profile;
    ranked.push({ poi, distanceM, score, visitMinutes });
  }
  return ranked.sort((a, b) => b.score - a.score || (a.poi.id < b.poi.id ? -1 : a.poi.id > b.poi.id ? 1 : 0));
}
