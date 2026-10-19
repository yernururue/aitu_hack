"use client";

import { useState } from "react";
import { ArrowUpRight, Bookmark, Clock3, EyeOff, Navigation, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/components/search-form";
import { buildNavigationLinks } from "@/lib/navigation";
import type { Poi } from "@/lib/contracts/poi";
import type { Recommendation } from "@/lib/contracts/response";

export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} м` : `${(meters / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`;
}
export function PlaceRoutes({ poi, idPrefix }: { poi: Poi; idPrefix: string }) {
  const [mode, setMode] = useState<"walking" | "driving">("walking");
  const links = buildNavigationLinks(poi, mode);
  return <div className="place-routes">
    <fieldset><legend className="field-label">Маршрут: способ передвижения</legend><div className="route-mode-options">
      {([["walking", "Пешком"], ["driving", "На машине"]] as const).map(([value, label]) => <label className="segment-option" key={value}><input type="radio" name={`${idPrefix}-route-mode`} checked={mode === value} onChange={() => setMode(value)} /><span>{label}</span></label>)}
    </div></fieldset>
    <div className="map-links"><Button asChild variant="outline"><a href={links.twoGis} target="_blank" rel="noopener noreferrer">2ГИС<ArrowUpRight aria-hidden="true" /></a></Button><Button asChild variant="outline"><a href={links.googleMaps} target="_blank" rel="noopener noreferrer">Google Maps<ArrowUpRight aria-hidden="true" /></a></Button></div>
    <p className="field-hint">До точки места. Начало пути выберите в картах; время на дорогу рассчитывают карты.</p>
  </div>;
}
export function PlaceCard({ recommendation: item, saved, onSave, onDismiss, onDetails }: {
  recommendation: Recommendation; saved: boolean; onSave: () => void; onDismiss: () => void; onDetails: (trigger: HTMLButtonElement) => void;
}) {
  const { poi } = item;
  return <Card role="article" aria-label={poi.name} data-poi-id={poi.id} className="recommendation-card">
    <div className="recommendation-meta"><span>{CATEGORY_LABELS[poi.category]}</span><span><Navigation aria-hidden="true" />{formatDistance(item.distanceM)} по прямой</span></div>
    <h3>{poi.name}</h3>
    {poi.rating && <p className="rating"><Star aria-hidden="true" />{poi.rating.value.toLocaleString("ru-RU")}<span>· {poi.rating.count.toLocaleString("ru-RU")} оценок</span></p>}
    {poi.description.text && <div className="catalog-description"><span className="mini-label">Из каталога</span><p className="place-description">{poi.description.text}</p></div>}
    <div className="place-data-labels"><span>{poi.price ? `${poi.price.min.toLocaleString("ru-RU")}–${poi.price.max.toLocaleString("ru-RU")} ₸ / чел.` : "Цена не подтверждена"}</span><span>{poi.hours?.weekly.length ? "Есть расписание в каталоге" : "Время работы не подтверждено"}</span></div>
    <div className="recommendation-reason"><span className="mini-label">Почему подходит</span><p>{item.why}</p></div>
    <div className="activity-idea"><span className="mini-label">Идея занятия</span><p>{item.activity}</p></div>
    <div className="recommendation-footer"><span><Clock3 aria-hidden="true" />{item.visitMinutes.min}–{item.visitMinutes.max} мин<span className="estimate-label">оценка посещения</span></span><Button variant="outline" aria-label={`Подробнее о ${poi.name}`} onClick={(event) => onDetails(event.currentTarget)}>Подробности<ArrowUpRight aria-hidden="true" /></Button></div>
    <div className="preference-actions"><Button variant="ghost" aria-pressed={saved} aria-label={`${saved ? "Убрать из сохранённых" : "Сохранить"} ${poi.name}`} onClick={onSave}><Bookmark aria-hidden="true" />{saved ? "Сохранено" : "Сохранить"}</Button><Button variant="ghost" aria-label={`Не интересно: ${poi.name}`} onClick={onDismiss}><EyeOff aria-hidden="true" />Не интересно</Button></div>
    <PlaceRoutes poi={poi} idPrefix={`card-${poi.id}`} />
  </Card>;
}
