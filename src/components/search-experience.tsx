"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchForm, CATEGORY_LABELS, type SearchMode } from "@/components/search-form";
import { RecommendResponseSchema, type RecommendResponse } from "@/lib/contracts/response";
import { PlaceCard } from "@/components/place-card";
import { PlaceDetails } from "@/components/place-details";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { loadDemoPreferences, persistDemoPreferences, resetDemoPreferences, updateDemoPreference, type DemoPreferences } from "@/lib/preferences";
import type { Recommendation } from "@/lib/contracts/response";
import type { RecommendRequest } from "@/lib/contracts/request";

export type DatasetInfo = { available: boolean; count: number; synthetic: boolean };
type SearchState = { status: "idle" | "loading" | "error" } | { status: "response"; response: RecommendResponse };

export function SearchExperience({ dataset, aiMode }: { dataset: DatasetInfo; aiMode: SearchMode }) {
  const [preferences, setPreferences] = useState<DemoPreferences>({ profileId: null, savedIds: [], dismissedIds: [] });
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const detailTrigger = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [submitted, setSubmitted] = useState<{ request: RecommendRequest; locationLabel: string } | null>(null);
  const sequence = useRef(0);
  const [revealSequence, setRevealSequence] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const response = state.status === "response" ? state.response : null;
  const contextFilters = response?.usedContext.filters ?? submitted?.request.filters;
  const contextProfileId = response ? response.usedContext.profileId : submitted?.request.profileId ?? null;
  const contextIsDemo = response ? response.usedContext.isDemoProfile : contextProfileId !== null;
  const companyLabels = { solo: "Один / одна", couple: "Вдвоём", friends: "С друзьями", family: "С семьёй" } as const;
  const profileLabels = { student: "Студент", tourist: "Турист", family: "Семья" } as const;
  const synthetic = dataset.synthetic || Boolean(response?.recommendations.some(({ poi }) => poi.sources.some((source) => source.kind === "synthetic")));

  useEffect(() => {
    let disposed = false;
    // Hydrate browser-owned history after mount; the first render matches SSR.
    queueMicrotask(() => { if (!disposed) { setPreferences(loadDemoPreferences()); setPreferencesReady(true); } });
    return () => { disposed = true; };
  }, []);

  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);

  useEffect(() => {
    // Only an explicit search moves the reader to the results. Preference
    // refreshes keep their control's focus and the current reading position.
    if (revealSequence === null || revealSequence !== sequence.current) return;
    const heading = resultsHeading.current;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [revealSequence]);

  async function search(request: RecommendRequest, locationLabel: string, revealResults = false) {
    const currentSequence = ++sequence.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setSelected(null);
    setSubmitted({ request, locationLabel });
    setState({ status: "loading" });
    if (revealResults) setRevealSequence(currentSequence);
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

  function applyPreferences(next: DemoPreferences, message: string, persist = true) {
    setPreferences(next);
    const stored = !persist || persistDemoPreferences(next);
    setHistoryMessage(stored ? message : `${message} Браузер не дал сохранить изменения; они действуют только на этом экране.`);
    sequence.current++; controller.current?.abort(); setSelected(null);
    if (submitted) void search({ ...submitted.request, profileId: next.profileId, savedIds: [...next.savedIds], dismissedIds: [...next.dismissedIds] }, submitted.locationLabel);
    else setState({ status: "idle" });
  }
  function resetHistory() {
    const reset = resetDemoPreferences();
    applyPreferences(reset.state, reset.persisted ? "Демо-история сброшена. Запрос и фильтры сохранены в форме." : "История очищена на этом экране. Браузер не дал удалить сохранение; после перезагрузки оно может вернуться.", false);
  }

  const title = state.status === "loading" ? "Ищем места рядом"
    : state.status === "error" ? "Поиск временно недоступен"
      : response?.status === "needs_clarification" ? "Нужно немного уточнить"
        : response?.status === "no_results" || (response?.status === "degraded" && response.recommendations.length === 0) ? "Мест по этим условиям нет"
          : response ? "Вот что нашлось рядом" : "Ваш следующий план";

  return (
    <div className="app-shell">
      <a className="skip-link" href={aiMode === "disabled" ? "#search-category" : "#search-query"}>Перейти к поиску</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Куда в Астане — на главную"><MapPin className="brand-symbol" aria-hidden="true" /><span>Куда в Астане<span className="brand-caption">Места для вашего времени</span></span></Link>
        <div className="city-label"><span className="city-dot" />Астана<span className="city-country">, Казахстан</span></div>
      </header>
      <main className="workspace">
        <section className="results-intro" aria-labelledby="page-title"><div><span className="eyebrow">Городской проводник · Астана</span><h1 id="page-title">Куда сегодня<span>?</span></h1><p>Места под ваше настроение.</p></div></section>
        <section className="search-sidebar" aria-label="Условия поиска"><SearchForm preferences={preferences} profileControls={<ProfileSwitcher preferences={preferences} ready={preferencesReady} onChange={(profileId) => applyPreferences({ ...preferences, profileId }, "Демо-профиль изменён.")} onReset={resetHistory} />} aiMode={aiMode} synthetic={synthetic} onSearch={(request, locationLabel) => search(request, locationLabel, true)} loading={state.status === "loading"} /></section>
        <section className="results-area" aria-label="Результаты поиска">
          {synthetic && <p className="synthetic-warning" role="note">Синтетические тестовые данные — не реальные места</p>}
          {historyMessage && <p className="history-message" role="status">{historyMessage}</p>}
          <div className="results-toolbar"><h2 ref={resultsHeading} tabIndex={-1} aria-describedby="search-result-status">Ваши варианты</h2><span>{response ? `${response.recommendations.length} из 3` : "До 3 мест"}</span></div>
          {submitted && contextFilters && <div className="search-context" aria-label="Что учтено">
            <span className="context-title">{response ? "Что учтено" : "Условия запроса"}</span>
            <span><MapPin aria-hidden="true" />{response?.usedContext.locationLabel ?? submitted.locationLabel}</span>
            <span>{contextFilters.radiusM / 1000} км по прямой</span><span>Посещение до {contextFilters.durationMinutes} мин</span>
            <span>{companyLabels[contextFilters.company]}</span>
            {submitted.request.query && <span className="context-query">«{submitted.request.query}»</span>}
            {contextFilters.categories.map((category) => <span key={category}>{CATEGORY_LABELS[category]}</span>)}
            {contextFilters.maxSpendKzt !== null ? <span>До {contextFilters.maxSpendKzt.toLocaleString("ru-RU")} ₸ / чел. · неизвестные цены исключены</span> : <span>Бюджет без ограничения</span>}
            {contextFilters.openNow && <span>По расписанию открыто · неизвестные часы исключены</span>}
            {response?.usedContext.filters.requiredFacts.map((fact) => <span key={fact}>Требуется: {{ quiet: "подтверждённая тишина", outlets: "розетки", wifi: "Wi-Fi", childFriendly: "подходит детям", indoor: "в помещении" }[fact]}</span>)}
            {contextIsDemo && <span>Демо-профиль: {contextProfileId ? profileLabels[contextProfileId] : "демонстрационная история"}</span>}
            {submitted.request.savedIds.length > 0 && <span>Сохранено: {submitted.request.savedIds.length}</span>}
            {submitted.request.dismissedIds.length > 0 && <span>Скрыто: {submitted.request.dismissedIds.length}</span>}
          </div>}
          <div className="result-announcement" aria-live="polite" aria-atomic="true"><h3 id="search-result-status" className="sr-only">{title}</h3></div>
          {(!response || response.recommendations.length === 0) && <Card className={`empty-canvas ${state.status === "loading" ? "is-loading" : ""}`} aria-busy={state.status === "loading"}>
            <div className="empty-copy"><h3 aria-hidden="true">{title}</h3><p>{state.status === "idle" ? (aiMode === "disabled" ? "Выберите категорию и нажмите «Найти места»." : "Опишите желание или выберите категорию.") : state.status === "loading" ? "Проверяем ваш запрос и выбранные условия. Это может занять немного времени." : state.status === "error" ? "Не удалось получить проверенный ответ. Попробуйте ещё раз — ваши условия остались в форме." : response?.message}</p>{response?.status === "no_results" && <p className="empty-next-step">{response.usedContext.filters.maxSpendKzt !== null ? <>При заданном бюджете места с неизвестной ценой исключаются. Измените бюджет или уберите ограничение и повторите поиск. <a href="#search-budget" onClick={(event) => { event.preventDefault(); const details = document.getElementById("search-conditions") as HTMLDetailsElement | null; if (details) details.open = true; document.getElementById("search-budget")?.focus(); }}>Изменить бюджет</a></> : <>Попробуйте увеличить радиус или изменить категорию. Условия не будут изменены автоматически.</>}</p>}</div>
            {state.status === "error" && submitted && <Button variant="outline" onClick={() => search(submitted.request, submitted.locationLabel, true)}>Повторить поиск<ArrowUpRight aria-hidden="true" /></Button>}
          </Card>}
          {response && response.recommendations.length > 0 && <div className="recommendation-list">
            {response.status === "degraded" && <p className="degraded-notice">{response.message}</p>}
            {response.recommendations.map((recommendation) => <PlaceCard key={recommendation.poi.id} recommendation={recommendation} saved={preferences.savedIds.includes(recommendation.poi.id)} onSave={() => applyPreferences(updateDemoPreference(preferences, { kind: "save", poiId: recommendation.poi.id, active: !preferences.savedIds.includes(recommendation.poi.id) }), "Сохранения обновлены.")} onDismiss={() => applyPreferences(updateDemoPreference(preferences, { kind: "dismiss", poiId: recommendation.poi.id, active: true }), "Место скрыто. Вернуть скрытые места можно сбросом демо-истории.")} onDetails={(trigger) => { detailTrigger.current = trigger; setSelected(recommendation); }} />)}
          </div>}
          <div className="data-disclosure-area"><p className="data-note">Цены и часы уточните перед визитом.</p><details className="data-disclosure" aria-label="О данных и ограничениях"><summary>О данных и ограничениях</summary>
            <div className="dataset-note"><p>{dataset.available ? <>В каталоге <strong>{dataset.count.toLocaleString("ru-RU")}</strong> мест{dataset.synthetic ? " для тестирования" : " Астаны"}. Подбираем только из этого набора.</> : <>Каталог мест сейчас недоступен.</>}<span>Неизвестные цены и часы остаются неизвестными.</span></p></div>
            {response?.warnings.length ? <ul className="response-warnings" aria-label="Ограничения данных">{response.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
            {response && <details className="snapshot-details" aria-label="Версия каталога"><summary>Версия данных: <code>{response.usedContext.dataSnapshot.slice(0, 12)}</code></summary><code className="snapshot-value">{response.usedContext.dataSnapshot}</code></details>}
          </details></div>
        </section>
      </main>
      <PlaceDetails recommendation={selected} synthetic={synthetic} onClose={() => setSelected(null)} triggerRef={detailTrigger} fallbackRef={resultsHeading} />
      <footer className="site-footer"><span>Куда в Астане</span></footer>
    </div>
  );
}
