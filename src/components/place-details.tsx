"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PlaceRoutes, formatDistance } from "@/components/place-card";
import type { Recommendation } from "@/lib/contracts/response";
import { FACT_KEYS } from "@/lib/contracts/poi";

const factLabels = { quiet: "Тишина", outlets: "Розетки", wifi: "Wi-Fi", childFriendly: "Подходит детям", indoor: "В помещении" };
const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
function date(value: string | null) { return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(value)) : "не указана"; }
function SourceReference({ url, children }: { url: string; children: ReactNode }) {
  // Provenance may be HTTP; only an existing HTTPS address is clickable.
  const https = new URL(url).protocol === "https:";
  return https ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}<br /><span>{url}</span></span>;
}
export function PlaceDetails({ recommendation, synthetic, onClose, triggerRef, fallbackRef }: {
  recommendation: Recommendation | null; synthetic: boolean; onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>; fallbackRef: RefObject<HTMLHeadingElement | null>;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  if (!recommendation) return null;
  const { poi } = recommendation;
  const reviews = poi.reviews.slice(0, 2);
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="place-details" onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); const target = triggerRef.current?.isConnected ? triggerRef.current : fallbackRef.current; target?.focus(); }}>
      <SheetHeader><SheetTitle ref={titleRef} tabIndex={-1}>{poi.name}</SheetTitle><SheetDescription>Сведения выбранного места, источники и идеи для посещения.</SheetDescription></SheetHeader>
      {synthetic && <p className="synthetic-warning">Синтетические тестовые данные — не реальные места</p>}
      <section className="detail-section"><h3>Из каталога</h3><p>{poi.description.text || "Описание не добавлено"}</p><dl className="detail-facts"><div><dt>Адрес</dt><dd>{poi.address ?? "Адрес не подтверждён"}</dd></div><div><dt>Цена за посещение на человека</dt><dd>{poi.price ? `${poi.price.min.toLocaleString("ru-RU")}–${poi.price.max.toLocaleString("ru-RU")} ₸` : "Цена не подтверждена"}</dd></div><div><dt>Расстояние</dt><dd>{formatDistance(recommendation.distanceM)} по прямой</dd></div><div><dt>Посещение</dt><dd>{recommendation.visitMinutes.min}–{recommendation.visitMinutes.max} мин — оценка, без дороги</dd></div></dl></section>
      <section className="detail-section"><h3>Время работы</h3>{poi.hours?.weekly.length ? <><ul className="hours-list">{poi.hours.weekly.map((interval, index) => <li key={index}><span>{weekdays[interval.weekday]}</span>{interval.opens}–{interval.closes}{interval.overnight ? " (до следующего дня)" : ""}</li>)}</ul><p className="field-hint">Сохранённое расписание, Asia/Almaty. Фактическую работу и праздничные исключения уточните у места.</p></> : <p>Время работы не подтверждено</p>}</section>
      <section className="detail-section"><h3>Что известно об условиях</h3><dl className="detail-facts">{FACT_KEYS.map((key) => { const fact = poi.facts.find((item) => item.key === key); return <div key={key}><dt>{factLabels[key]}</dt><dd>{fact ? `${fact.value ? "Да" : "Нет"} — ${fact.confidence === "confirmed" ? "подтверждено источником" : "сообщается в источнике"}` : "Неизвестно"}</dd></div>; })}</dl></section>
      <section className="detail-section"><h3>Идея занятия</h3><p>{recommendation.activity}</p><p className="field-hint">Предложение для посещения, не подтверждённое событие.</p></section>
      <section className="detail-section"><h3>Источники и даты</h3><ul className="source-list">{poi.sources.map((source, index) => <li key={source.id}><SourceReference url={source.url}>Источник {index + 1} · {source.kind === "review" ? "отзыв" : source.kind === "official" ? "официальный" : source.kind === "synthetic" ? "тестовый" : "карточка / публикация"}</SourceReference><span>Собрано: {date(source.collectedAt)}</span><span>Публикация источника: {date(source.publishedAt)}</span></li>)}</ul></section>
      {poi.links.social.length > 0 && <section className="detail-section"><h3>Социальные страницы</h3><ul className="source-list">{poi.links.social.map((link, index) => <li key={index}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}</ul></section>}
      <section className="detail-section"><h3>Отзывы</h3>{reviews.length ? <details className="reviews-disclosure"><summary>Показать отзывы ({reviews.length})</summary>{reviews.map((review) => <article className="review-opinion" key={review.id}><strong>Мнение посетителя</strong><p>{review.text}</p><span>Дата отзыва: {date(review.publishedAt)}</span><div>{review.sourceIds.map((id) => { const source = poi.sources.find((item) => item.id === id); return source ? <SourceReference key={id} url={source.url}>Источник отзыва · собрано {date(source.collectedAt)}</SourceReference> : null; })}</div></article>)}</details> : <p>Отзывы не собраны</p>}</section>
      <PlaceRoutes poi={poi} idPrefix={`details-${poi.id}`} />
    </SheetContent>
  </Sheet>;
}
