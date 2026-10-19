"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Clock3, MapPin, Navigation, Search, ShieldCheck, Star, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchForm, CATEGORY_LABELS } from "@/components/search-form";
import { RecommendResponseSchema, type RecommendResponse } from "@/lib/contracts/response";
import type { RecommendRequest } from "@/lib/contracts/request";

export type DatasetInfo = { available: boolean; count: number; synthetic: boolean };
type SearchState = { status: "idle" | "loading" | "error" } | { status: "response"; response: RecommendResponse };

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} м` : `${(meters / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`;
}

export function SearchExperience({ dataset }: { dataset: DatasetInfo }) {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [submitted, setSubmitted] = useState<{ request: RecommendRequest; locationLabel: string } | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const response = state.status === "response" ? state.response : null;
  const contextFilters = response?.usedContext.filters ?? submitted?.request.filters;
  const companyLabels = { solo: "Один / одна", couple: "Вдвоём", friends: "С друзьями", family: "С семьёй" } as const;
  const profileLabels = { student: "Студент", tourist: "Турист", family: "Семья" } as const;
  const synthetic = dataset.synthetic || Boolean(response?.recommendations.some(({ poi }) => poi.sources.some((source) => source.kind === "synthetic")));

  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);

  async function search(request: RecommendRequest, locationLabel: string) {
    const currentSequence = ++sequence.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setSubmitted({ request, locationLabel });
    setState({ status: "loading" });
    try {
      const result = await fetch("/api/recommend", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: nextController.signal,
      });
      if (!result.ok) throw new Error("SEARCH_UNAVAILABLE");
      const parsed = RecommendResponseSchema.safeParse(await result.json());
      if (!parsed.success) throw new Error("SEARCH_INVALID_RESPONSE");
      if (currentSequence === sequence.current) setState({ status: "response", response: parsed.data });
    } catch {
      if (currentSequence === sequence.current && !nextController.signal.aborted) setState({ status: "error" });
    }
  }

  const title = state.status === "loading" ? "Ищем места рядом"
    : state.status === "error" ? "Поиск временно недоступен"
      : response?.status === "needs_clarification" ? "Нужно немного уточнить"
        : response?.status === "no_results" || (response?.status === "degraded" && response.recommendations.length === 0) ? "Мест по этим условиям нет"
          : response ? "Вот что нашлось рядом" : "Здесь будет ваш следующий план";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#search-query">Перейти к поиску</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Куда в Астане — на главную"><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span><span>Куда в Астане<span className="brand-caption">Места для вашего времени</span></span></Link>
        <div className="city-label"><span className="city-dot" />Астана<span className="city-country">, Казахстан</span></div>
      </header>
      <main className="workspace">
        <aside className="search-sidebar" aria-label="Условия поиска"><SearchForm onSearch={search} loading={state.status === "loading"} /></aside>
        <section className="results-area" aria-labelledby="page-title">
          <div className="results-intro"><span className="eyebrow">Рядом есть куда</span><h1 id="page-title">Куда сегодня<span>?</span></h1><p>На кофе, на прогулку или за новым впечатлением.<br className="desktop-break" /> Найдите место под ваше время и настроение.</p></div>
          {synthetic && <p className="synthetic-warning" role="note">Синтетические тестовые данные — не реальные места</p>}
          <div className="results-toolbar"><h2><SlidersHorizontal aria-hidden="true" />Ваши варианты</h2><span>{response ? `${response.recommendations.length} из 3` : "До 3 мест"}</span></div>
          {submitted && contextFilters && <div className="search-context" aria-label="Что учтено">
            <span className="context-title">Что учтено</span>
            <span><MapPin aria-hidden="true" />{response?.usedContext.locationLabel ?? submitted.locationLabel}</span>
            <span>{contextFilters.radiusM / 1000} км</span><span>Посещение до {contextFilters.durationMinutes} мин</span>
            <span>{companyLabels[contextFilters.company]}</span>
            {submitted.request.query && <span className="context-query">«{submitted.request.query}»</span>}
            {contextFilters.categories.map((category) => <span key={category}>{CATEGORY_LABELS[category]}</span>)}
            {contextFilters.maxSpendKzt !== null && <span>До {contextFilters.maxSpendKzt.toLocaleString("ru-RU")} ₸ / чел.</span>}
            {contextFilters.openNow && <span>По расписанию открыто</span>}
            <span>{response?.usedContext.isDemoProfile ? `Демо-профиль: ${response.usedContext.profileId ? profileLabels[response.usedContext.profileId] : "демонстрационная история"}` : "Без демо-профиля"}</span>
          </div>}
          <div className="result-announcement" aria-live="polite" aria-atomic="true"><h3 className={response?.recommendations.length ? "result-heading" : "sr-only"}>{title}</h3></div>
          {(!response || response.recommendations.length === 0) && <Card className={`empty-canvas ${state.status === "loading" ? "is-loading" : ""}`} aria-busy={state.status === "loading"}>
            <div className="city-route" aria-hidden="true"><span className="route-stop stop-first"><i /><span>желание</span></span><span className="route-line line-first" /><span className="route-stop stop-middle"><i /><MapPin /></span><span className="route-line line-last" /><span className="route-stop stop-last"><i /><span>ваше место</span></span></div>
            <div className="empty-copy"><h3 aria-hidden="true">{title}</h3><p>{state.status === "idle" ? "Расскажите, чего хочется, и выберите точку старта. Найдём подходящие места в каталоге." : state.status === "loading" ? "Проверяем ваш запрос и выбранные условия. Это может занять немного времени." : state.status === "error" ? "Не удалось получить проверенный ответ. Попробуйте ещё раз — ваши условия остались в форме." : response?.message}</p>{response?.status === "no_results" && <p className="empty-next-step">Попробуйте увеличить радиус или изменить категорию. Условия не будут изменены автоматически.</p>}</div>
            {state.status === "idle" && <div className="empty-caption"><span><MapPin aria-hidden="true" />Точка старта — на ваш выбор</span><span><Clock3 aria-hidden="true" />Время на дорогу — отдельно</span></div>}
            {state.status === "error" && submitted && <Button variant="outline" onClick={() => search(submitted.request, submitted.locationLabel)}>Повторить поиск<ArrowUpRight aria-hidden="true" /></Button>}
          </Card>}
          {response && response.recommendations.length > 0 && <div className="recommendation-list">
            <p className={response.status === "degraded" ? "degraded-notice" : "response-message"}>{response.message}</p>
            {response.recommendations.map((recommendation) => <Card className="recommendation-card" key={recommendation.poi.id}>
              <div className="recommendation-meta"><span>{CATEGORY_LABELS[recommendation.poi.category]}</span><span><Navigation aria-hidden="true" />{formatDistance(recommendation.distanceM)} по прямой</span></div>
              <h3>{recommendation.poi.name}</h3>
              {recommendation.poi.rating && <p className="rating"><Star aria-hidden="true" />{recommendation.poi.rating.value.toLocaleString("ru-RU")}<span>· {recommendation.poi.rating.count.toLocaleString("ru-RU")} оценок</span></p>}
              {recommendation.poi.description.text && <p className="place-description">{recommendation.poi.description.text}</p>}
              <div className="recommendation-reason"><span className="mini-label">Почему подходит</span><p>{recommendation.why}</p></div>
              <div className="activity-idea"><span className="mini-label">Идея занятия</span><p>{recommendation.activity}</p></div>
              <div className="recommendation-footer"><span><Clock3 aria-hidden="true" />{recommendation.visitMinutes.min}–{recommendation.visitMinutes.max} мин<span className="estimate-label">оценка посещения</span></span><Button asChild variant="outline"><a href={recommendation.navigation.twoGis ?? recommendation.navigation.googleMaps} target="_blank" rel="noreferrer">Маршрут<ArrowUpRight aria-hidden="true" /></a></Button></div>
            </Card>)}
          </div>}
          {response?.warnings.length ? <ul className="response-warnings" aria-label="Ограничения данных">{response.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
          <div className="dataset-note"><ShieldCheck aria-hidden="true" /><p>{dataset.available ? <>В каталоге <strong>{dataset.count.toLocaleString("ru-RU")}</strong> мест{dataset.synthetic ? " для тестирования" : " Астаны"}. Подбираем только из этого набора.</> : <>Каталог мест сейчас недоступен. Поиск покажет понятное сообщение, если данные ещё не подключены.</>}<span>Неизвестные цены и часы остаются неизвестными.</span></p></div>
          <div className="search-principles"><span><Search aria-hidden="true" />Ваш запрос важнее настроек по умолчанию</span><span>Сначала место. Затем маршрут.<ArrowUpRight aria-hidden="true" /></span></div>
        </section>
      </main>
      <footer className="site-footer"><span>Куда в Астане</span><span>Город ближе, когда есть план.</span></footer>
    </div>
  );
}
