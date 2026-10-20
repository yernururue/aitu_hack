// Node imports and catalogue access keep the dependency factory server-only.
import { createHash } from "node:crypto";
import type { Catalog, Poi } from "./contracts/poi";
import { RecommendRequestSchema, type Intent, type RecommendRequest } from "./contracts/request";
import { RecommendResponseSchema, type RecommendResponse } from "./contracts/response";
import { loadCatalog } from "./data/catalog";
import { createChatJson, type ChatJson } from "./ai/openrouter";
import { createLiveTransport } from "./ai/transport";
import type { Purpose } from "./ai/config";
import { explain } from "./ai/explain";
import type { ExplanationItem } from "./ai/validate";
import { canonicalDatasetHash, createGuardedEmbedder } from "./search/index";
import { filterCandidates } from "./search/filters";
import { configuredAiMode, deriveOriginContext, parseIntent, runBeforeDeadline, type AiMode } from "./search/intent";
import { retrieveWithMetadata, type RetrievalResult } from "./search/retrieve";
import type { RankedPoi } from "./search/rank";
import { buildNavigationLinks } from "./navigation";

export type RetrievalContext = { catalog: Catalog; mode: AiMode; deadlineAt: number; signal?: AbortSignal; purpose?: Purpose };
export type RecommendDependencies = {
  mode?: AiMode; now?: Date; deadlineAt?: number; signal?: AbortSignal; purpose?: Purpose;
  loadCatalog?: () => Promise<Catalog>; chatJson?: ChatJson;
  retrieve?: (request: RecommendRequest, intent: Intent, now: Date, context: RetrievalContext) => Promise<RetrievalResult>;
};
const ideas: Readonly<Record<Poi["category"], string>> = {
  cafe: "Идея: выпить кофе или сделать небольшой перерыв.", restaurant: "Идея: пообедать и пообщаться.",
  park: "Идея: прогуляться в удобном темпе.", museum: "Идея: познакомиться с экспозицией.",
  bowling: "Идея: сыграть в боулинг с компанией.", entertainment: "Идея: выбрать занятие на месте.", other: "Идея: осмотреть место и сделать перерыв.",
};
function deterministic(candidates: readonly RankedPoi[]): ExplanationItem[] {
  return candidates.slice(0, 3).map(({ poi }) => ({ poiId: poi.id, why: "Место из каталога подходит по выбранной категории и заданным ограничениям.", activity: ideas[poi.category], evidenceIds: [...poi.description.sourceIds] }));
}

export async function recommend(input: RecommendRequest, dependencies: RecommendDependencies = {}): Promise<RecommendResponse> {
  const request = RecommendRequestSchema.parse(input);
  const now = dependencies.now ?? new Date();
  const deadlineAt = Math.min(dependencies.deadlineAt ?? Date.now() + 25_000, Date.now() + 25_000);
  const mode = dependencies.mode ?? configuredAiMode();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  dependencies.signal?.addEventListener("abort", onAbort, { once: true });
  if (dependencies.signal?.aborted) controller.abort();
  const timer = setTimeout(onAbort, Math.max(0, deadlineAt - Date.now()));
  const signal = controller.signal;
  let chat: ChatJson | undefined;
  // Construct nothing live until an allowed live stage actually dispatches.
  const chatJson: ChatJson = (args) => {
    if (mode !== "live" || signal.aborted || Date.now() >= deadlineAt) return Promise.reject(new Error("REQUEST_INTERRUPTED"));
    chat ??= dependencies.chatJson ?? createChatJson();
    return chat(args);
  };
  try {
    const catalog = await runBeforeDeadline(() => (dependencies.loadCatalog ?? loadCatalog)(), deadlineAt, signal);
    const dataSnapshot = canonicalDatasetHash(catalog);
    const originContext = deriveOriginContext(request.location);
    const intent = await parseIntent(request.query, request.filters, request.explicitFilterKeys, { mode, chatJson, deadlineAt, signal, purpose: dependencies.purpose, originContext });
    const usedContext = { locationLabel: request.location.source === "device" ? "Ваша геолокация" : originContext ?? "Выбранная точка", filters: intent, profileId: request.profileId, isDemoProfile: request.profileId !== null, dataSnapshot };
    const warnings: string[] = [];
    if (request.profileId !== null) warnings.push("Использован демонстрационный профиль, а не история ваших посещений.");
    if (mode === "stub") warnings.push("Включён демо-разбор известных текстовых фраз; ИИ-объяснения недоступны.");
    if (mode === "disabled") warnings.push("ИИ-разбор текста и ИИ-объяснения недоступны. Выбранные категории работают локально.");
    const response = (status: RecommendResponse["status"], message: string, recommendations: RecommendResponse["recommendations"] = []) => RecommendResponseSchema.parse({ status, message, recommendations, usedContext, warnings: [...new Set(warnings)] });
    if (intent.conflict !== null) return response("needs_clarification", intent.conflict);
    const context: RetrievalContext = { catalog, mode, deadlineAt, signal, purpose: dependencies.purpose };
    const retrieve = dependencies.retrieve ?? (async (query, applied, serverNow, stageContext) => {
      // The embedder lazily creates its transport only after a compatible index
      // exists and retrieval really needs a query vector. Stub/disabled bypass it.
      const embed = mode === "live" ? createGuardedEmbedder({ execute: (args) => {
        if (signal.aborted || Date.now() >= deadlineAt) return Promise.reject(new Error("REQUEST_INTERRUPTED"));
        return createLiveTransport().execute({ ...args, signal, deadlineAt, timeoutMs: 15_000 });
      } }, dependencies.purpose ?? "prep") : undefined;
      return retrieveWithMetadata(query, applied, serverNow, { catalog: stageContext.catalog, ...(mode === "live" ? { embed } : { index: null }) });
    });
    const result = await runBeforeDeadline(() => retrieve(request, intent, now, context), deadlineAt, signal);
    warnings.push(...result.warnings);
    if (result.mode === "lexical") warnings.push("Использован лексический поиск по словам с теми же ограничениями.");
    // Injectable retrieval remains server-only; still enforce loaded IDs and hard
    // filters before any generated explanation can enter the response.
    const eligible = new Set(filterCandidates(catalog.places, intent, request.location, now).map((poi) => poi.id));
    const loaded = new Map(catalog.places.map((poi) => [poi.id, poi]));
    const seen = new Set<string>();
    const candidates = result.candidates.filter(({ poi }) => {
      if (!eligible.has(poi.id) || seen.has(poi.id)) return false;
      seen.add(poi.id); return true;
    }).slice(0, 8).map((candidate) => ({ ...candidate, poi: loaded.get(candidate.poi.id)! }));
    if (!candidates.length) return response("no_results", "По заданным условиям мест не найдено. Измените условия явно, чтобы продолжить.");
    if (candidates.some(({ poi }) => poi.price === null)) warnings.push("Цены некоторых мест неизвестны; уточните их перед посещением.");
    if (candidates.some(({ poi }) => poi.hours === null)) warnings.push("Часы работы некоторых мест неизвестны; уточните расписание.");
    if (candidates.some(({ poi }) => poi.hours !== null)) warnings.push("Работающие места определены по сохранённому расписанию без праздничных исключений.");
    warnings.push("Расстояние указано по прямой. Длительность посещения — оценка; дорога в неё не включена.");
    let items: ExplanationItem[];
    let degraded = mode !== "live" || result.mode === "lexical";
    try {
      if (mode !== "live") items = deterministic(candidates);
      else items = await explain(candidates, intent, { query: request.query, locale: request.locale, chatJson, deadlineAt, signal, purpose: dependencies.purpose });
    } catch {
      items = deterministic(candidates); degraded = true;
      warnings.push("ИИ-объяснения недоступны или не прошли проверку. Показаны сведения из каталога.");
    }
    const byId = new Map(candidates.map((candidate) => [candidate.poi.id, candidate]));
    const recommendations = items.map((item) => {
      const { poi, distanceM, visitMinutes } = byId.get(item.poiId)!;
      return { poi, distanceM, distanceKind: "straight_line" as const, why: item.why, activity: item.activity, evidenceIds: item.evidenceIds, visitMinutes, navigation: buildNavigationLinks(poi, "walking") };
    });
    return response(degraded ? "degraded" : "ok", degraded ? "Подходящие места из каталога. Часть ИИ-возможностей недоступна." : "Найдены подходящие места.", recommendations);
  } finally {
    clearTimeout(timer); dependencies.signal?.removeEventListener("abort", onAbort);
  }
}

type HandlerContext = { now: Date; deadlineAt: number; signal: AbortSignal };
type RateDecision = { allowed: boolean; retryAfterSeconds: number };
export type RecommendHandlerDependencies = {
  now?: () => Date;
  recommend?: (request: RecommendRequest, context: HandlerContext) => Promise<RecommendResponse>;
  rateLimit?: (request: Request, now: Date) => RateDecision | Promise<RateDecision>;
};
function localRateLimit() {
  const buckets = new Map<string, { start: number; count: number }>();
  return (request: Request, now: Date): RateDecision => {
    const time = now.getTime();
    for (const [key, bucket] of buckets) if (time - bucket.start >= 60_000) buckets.delete(key);
    const key = createHash("sha256").update(request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local").digest("hex");
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 2000) return { allowed: false, retryAfterSeconds: 60 };
      bucket = { start: time, count: 0 }; buckets.set(key, bucket);
    }
    bucket.count++;
    return { allowed: bucket.count <= 20, retryAfterSeconds: Math.max(1, Math.ceil((60_000 - (time - bucket.start)) / 1000)) };
  };
}
class InvalidBody extends Error {}
async function readBody(request: Request, deadlineAt: number, signal: AbortSignal): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidBody();
  let complete = false;
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await runBeforeDeadline(() => reader.read(), deadlineAt, signal);
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > 16 * 1024) throw new InvalidBody();
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new InvalidBody(); }
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* A cancelled pending read releases asynchronously. */ }
  }
}

export function createRecommendHandler(dependencies: RecommendHandlerDependencies = {}): (request: Request) => Promise<Response> {
  const limit = dependencies.rateLimit ?? localRateLimit();
  return async (request) => {
    const now = (dependencies.now ?? (() => new Date()))();
    const deadlineAt = now.getTime() + 25_000;
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) controller.abort();
    const timer = setTimeout(abort, Math.max(0, deadlineAt - Date.now()));
    const signal = controller.signal;
    const failure = (status: number) => Response.json({ message: status === 400 ? "Проверьте формат запроса." : "Сервис временно недоступен. Повторите запрос." }, { status, headers: { "Cache-Control": "no-store" } });
    try {
      if (signal.aborted) return failure(503);
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return failure(400);
      const decision = await runBeforeDeadline(async () => limit(request, now), deadlineAt, signal);
      if (!decision.allowed) return Response.json({ message: "Слишком много запросов. Повторите немного позже." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(decision.retryAfterSeconds))), "Cache-Control": "no-store" } });
      const raw = await readBody(request, deadlineAt, signal);
      const parsed = RecommendRequestSchema.safeParse(raw);
      if (!parsed.success) return failure(400);
      const context = { now, deadlineAt, signal };
      const core = dependencies.recommend ?? recommend;
      const result = await runBeforeDeadline(() => core(parsed.data, context), deadlineAt, signal);
      return Response.json(RecommendResponseSchema.parse(result), { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return failure(error instanceof InvalidBody ? 400 : 503); }
    finally { clearTimeout(timer); request.signal.removeEventListener("abort", abort); }
  };
}
