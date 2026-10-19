"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Coffee, Footprints, LocateFixed, MapPin, Search, Utensils, Users, Landmark, Sparkles, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createDefaultFilters, DURATION_OPTIONS, FILTER_KEYS, RADIUS_OPTIONS, RecommendRequestSchema,
  type Filters, type RecommendRequest,
} from "@/lib/contracts/request";
import type { DemoPreferences } from "@/lib/preferences";
import type { Poi } from "@/lib/contracts/poi";

export const CATEGORY_LABELS: Record<Poi["category"], string> = {
  cafe: "Кафе", restaurant: "Рестораны", park: "Парки", museum: "Музеи",
  bowling: "Боулинг", entertainment: "Развлечения", other: "Другое",
};
const CATEGORIES: { value: Poi["category"]; icon: ReactNode }[] = [
  { value: "cafe", icon: <Coffee /> }, { value: "restaurant", icon: <Utensils /> },
  { value: "park", icon: <Footprints /> }, { value: "museum", icon: <Landmark /> },
  { value: "bowling", icon: <CircleDot /> }, { value: "entertainment", icon: <Sparkles /> },
  { value: "other", icon: <MapPin /> },
];
const PRESETS = [
  { label: "EXPO", lat: 51.090, lon: 71.418 },
  { label: "Бәйтерек", lat: 51.1282, lon: 71.4304 },
  { label: "Набережная", lat: 51.1669, lon: 71.4179 },
] as const;
const COMPANIES = [
  { value: "solo", label: "Один / одна" }, { value: "couple", label: "Вдвоём" },
  { value: "friends", label: "С друзьями" }, { value: "family", label: "С семьёй" },
] as const;

export type SearchMode = "disabled" | "stub" | "live";
const DEMO_PHRASES = ["Кофе рядом", "Хочу погулять", "Музей на час", "Боулинг с друзьями", "Кафе с розеткой"] as const;

type Props = { preferences: DemoPreferences; profileControls: ReactNode; aiMode: SearchMode; synthetic: boolean; onSearch: (request: RecommendRequest, locationLabel: string) => void; loading: boolean };

export function SearchForm({ onSearch, loading, aiMode, synthetic, preferences, profileControls }: Props) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(createDefaultFilters);
  const [explicit, setExplicit] = useState<Set<keyof Filters>>(() => new Set());
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState<RecommendRequest["location"]>({ lat: PRESETS[0].lat, lon: PRESETS[0].lon, source: "preset" });
  const [locationLabel, setLocationLabel] = useState<string>(PRESETS[0].label);
  const [geoMessage, setGeoMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"query" | "budget" | null>(null);
  const geoSequence = useRef(0);
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const budgetRef = useRef<HTMLInputElement>(null);

  function updateFilter<Key extends keyof Filters>(key: Key, value: Filters[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setExplicit((current) => new Set(current).add(key));
    setError("");
  }

  function selectPreset(preset: (typeof PRESETS)[number]) {
    geoSequence.current++;
    setLocating(false);
    setLocation({ lat: preset.lat, lon: preset.lon, source: "preset" });
    setLocationLabel(preset.label);
    setGeoMessage("");
  }

  function locate() {
    const sequence = ++geoSequence.current;
    if (!navigator.geolocation) {
      setGeoMessage("Геолокация недоступна в этом браузере. Выберите ориентир ниже.");
      return;
    }
    setLocating(true);
    setGeoMessage("Запрашиваем местоположение. Можно выбрать ориентир вручную.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (sequence !== geoSequence.current) return;
        setLocation({ lat: coords.latitude, lon: coords.longitude, source: "device" });
        setLocationLabel("Моё местоположение");
        setLocating(false);
        setGeoMessage("Местоположение получено. Оно используется только для этого поиска.");
      },
      (failure) => {
        if (sequence !== geoSequence.current) return;
        setLocating(false);
        setGeoMessage(failure.code === 1
          ? "Доступ к геолокации закрыт. Выберите EXPO, Бәйтерек или Набережную ниже."
          : "Не удалось определить местоположение. Выберите ориентир ниже или попробуйте ещё раз.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() && filters.categories.length === 0) {
      setErrorField("query");
      setError("Опишите желание или выберите хотя бы одну категорию.");
      queryRef.current?.focus();
      return;
    }
    const maxSpendKzt = budget.trim() ? Number(budget) : null;
    if (budgetRef.current?.validity.badInput || (maxSpendKzt !== null && (!Number.isFinite(maxSpendKzt) || maxSpendKzt < 0))) {
      setErrorField("budget");
      budgetRef.current?.focus();
      setError("Укажите бюджет на человека: 0 ₸ или больше. Либо оставьте поле пустым.");
      return;
    }
    const parsed = RecommendRequestSchema.safeParse({
      query: query.trim(), locale: "ru", location,
      filters: { ...filters, maxSpendKzt },
      explicitFilterKeys: FILTER_KEYS.filter((key) => explicit.has(key)),
      profileId: preferences.profileId, savedIds: [...preferences.savedIds], dismissedIds: [...preferences.dismissedIds],
    });
    if (!parsed.success) {
      setErrorField(null);
      setError("Проверьте параметры поиска. Запрос должен быть не длиннее 1000 символов.");
      return;
    }
    setError("");
    onSearch(parsed.data, locationLabel);
  }

  return (
    <form className="search-form" onSubmit={submit} noValidate aria-label="Поиск мест">
      <div className="form-heading"><span className="eyebrow">Ваш план</span><span className="form-heading-note">На сегодня</span></div>
      <div className="form-section query-section">
        <label className="field-label" htmlFor="search-query">Чем хочется заняться?</label>
        {aiMode !== "live" && <div className="search-mode-notice" role="note" aria-label="Режим текстового поиска">
          <strong>{aiMode === "stub" ? "Демо-разбор текста" : "ИИ-разбор отключён"}</strong>
          <p>{aiMode === "stub" ? "Распознаём только пять готовых фраз ниже. ИИ-объяснения недоступны." : "Выберите категории и фильтры без текста. Для текстового запроса потребуется уточнение; ИИ-объяснения недоступны."}</p>
          <span>{synthetic ? "Места из синтетического тестового каталога." : "Места из реального каталога; данные могут быть неполными."}</span>
        </div>}
        <textarea
          ref={queryRef} id="search-query" name="query" rows={3} maxLength={1000}
          placeholder={aiMode === "stub" ? "Например, «Хочу погулять»" : aiMode === "disabled" ? "Выберите категорию ниже, оставив текст пустым" : "Например, выпить кофе в тихом месте или прогуляться у воды"}
          value={query} onChange={(event) => { setQuery(event.target.value); setError(""); }}
          aria-describedby={error && errorField === "query" ? "search-validation-error" : "query-hint"} aria-invalid={Boolean(error) && errorField === "query"}
        />
        <p id="query-hint" className="field-hint">{aiMode === "stub" ? "Готовую фразу можно сочетать с фильтрами. При конфликте попросим уточнение." : aiMode === "disabled" ? "Категории работают без ИИ. Фильтры сохранят выбранные ограничения." : "Напишите желание или выберите категорию. Можно вместе."}</p>
        {aiMode === "stub" && <div className="demo-phrase-options" aria-label="Готовые фразы демо-разбора">
          <span className="demo-phrase-label">Попробуйте точную фразу</span>
          {DEMO_PHRASES.map((phrase) => <Button key={phrase} variant="ghost" className="demo-phrase-button" onClick={() => { setQuery(phrase); setError(""); queryRef.current?.focus(); }}>{phrase}</Button>)}
        </div>}
        <fieldset className="categories-fieldset">
          <legend className="sr-only">Категории мест</legend>
          <div className="category-options">
            {CATEGORIES.map(({ value, icon }) => (
              <label className="category-option" key={value}>
                <input type="checkbox" name="category" value={value} checked={filters.categories.includes(value)} onChange={(event) => updateFilter("categories", event.target.checked ? [...filters.categories, value] : filters.categories.filter((category) => category !== value))} />
                <span>{icon}{CATEGORY_LABELS[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="form-section">
        <div className="field-title-row"><span className="field-label"><MapPin aria-hidden="true" />Откуда начнём?</span><span className="location-selection">{locationLabel}</span></div>
        <Button className="location-button" variant="outline" onClick={locate} disabled={locating} aria-label="Определить моё местоположение">
          <LocateFixed aria-hidden="true" />{locating ? "Определяем…" : "Моё местоположение"}<ArrowUpRight aria-hidden="true" className="location-arrow" />
        </Button>
        <p className="field-hint location-disclosure">Доступ — только по нажатию. Координаты передаются для поиска и не сохраняются в истории.</p>
        {geoMessage && <p className="geo-message" role="status">{geoMessage}</p>}
        <div className="preset-options" aria-label="Ориентиры Астаны">
          {PRESETS.map((preset) => <Button key={preset.label} variant="ghost" className="preset-button" aria-pressed={location.source === "preset" && locationLabel === preset.label} onClick={() => selectPreset(preset)}>{preset.label}</Button>)}
        </div>
      </div>

      <div className="form-section filter-section">
        <fieldset>
          <legend className="field-label">Радиус поиска</legend>
          <div className="segment-options">
            {RADIUS_OPTIONS.map((radius) => <label key={radius} className="segment-option"><input type="radio" name="radius" value={radius} checked={filters.radiusM === radius} onChange={() => updateFilter("radiusM", radius)} /><span>{radius / 1000} км</span></label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="field-label">Время на посещение</legend>
          <div className="segment-options">
            {DURATION_OPTIONS.map((duration) => <label key={duration} className="segment-option"><input type="radio" name="duration" aria-label={`${duration} минут`} value={duration} checked={filters.durationMinutes === duration} onChange={() => updateFilter("durationMinutes", duration)} /><span>{duration} мин</span></label>)}
          </div>
          <p className="field-hint">Оценка посещения. Время на дорогу — отдельно.</p>
        </fieldset>
        <fieldset>
          <legend className="field-label"><Users aria-hidden="true" />С кем идёте?</legend>
          <div className="company-options">
            {COMPANIES.map(({ value, label }) => <label key={value} className="segment-option"><input type="radio" name="company" value={value} checked={filters.company === value} onChange={() => updateFilter("company", value)} /><span>{label}</span></label>)}
          </div>
        </fieldset>
        <div>
          <label className="field-label" htmlFor="search-budget">Бюджет на человека, ₸<span className="optional-label">необязательно</span></label>
          <Input ref={budgetRef} id="search-budget" name="budget" type="number" min="0" step="any" inputMode="decimal" placeholder="Без ограничения" value={budget} onChange={(event) => { setBudget(event.target.value); updateFilter("maxSpendKzt", event.target.value === "" ? null : Number(event.target.value)); }} aria-describedby={error && errorField === "budget" ? "search-validation-error budget-hint" : "budget-hint"} aria-invalid={Boolean(error) && errorField === "budget"} />
          <p className="field-hint" id="budget-hint">При заданном бюджете подойдут только места с известной ценой.</p>
        </div>
        <label className="open-checkbox"><input type="checkbox" checked={filters.openNow} onChange={(event) => updateFilter("openNow", event.target.checked)} /><span>По расписанию открыто сейчас</span></label>
      </div>
      {profileControls}
      <div className="form-action">
        {error && <p id="search-validation-error" role="alert" className="validation-error">{error}</p>}
        <Button type="submit" className="search-submit" size="lg"><Search aria-hidden="true" />Найти места<ArrowUpRight aria-hidden="true" /></Button>
        <p className="submit-hint">До трёх вариантов под ваши условия{loading ? " · Поиск выполняется" : ""}</p>
      </div>
    </form>
  );
}
