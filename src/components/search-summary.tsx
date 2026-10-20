import type { Filters, ProfileId } from "@/lib/contracts/request";
import type { Poi } from "@/lib/contracts/poi";
import { DEMO_PROFILE_LABELS } from "@/lib/profiles";

export const CATEGORY_LABELS: Record<Poi["category"], string> = {
  cafe: "Кафе", restaurant: "Рестораны", park: "Парки", museum: "Музеи",
  bowling: "Боулинг", entertainment: "Развлечения", other: "Другое",
};
const companyLabels = { solo: "Один / одна", couple: "Вдвоём", friends: "С друзьями", family: "С семьёй" };

export function SearchSummary({ filters, locationLabel, profileId, savedCount = 0, dismissedCount = 0, budgetInvalid = false, label }: {
  filters: Filters; locationLabel: string; profileId: ProfileId | null; savedCount?: number; dismissedCount?: number; budgetInvalid?: boolean; label: string;
}) {
  return <div className="conditions-summary" aria-label={label}>
    <span className="summary-location">{locationLabel}</span>
    <span>{filters.radiusM / 1000} км по прямой</span>
    <span>Посещение до {filters.durationMinutes} мин · оценка</span>
    <span>{companyLabels[filters.company]}</span>
    {filters.categories.length ? filters.categories.map((category) => <span key={category}>{CATEGORY_LABELS[category]}</span>) : <span>Все категории</span>}
    <span>{budgetInvalid ? "Бюджет: проверьте значение" : filters.maxSpendKzt === null ? "Бюджет без ограничения" : filters.maxSpendKzt === 0 ? "Только подтверждённо бесплатно" : `До ${filters.maxSpendKzt.toLocaleString("ru-RU")} ₸ / чел.`}</span>
    <span>{filters.openNow ? "По расписанию открыто" : "Неизвестные часы допустимы"}</span>
    <span className={profileId ? "summary-demo" : undefined}>{profileId ? `Демо-профиль: ${DEMO_PROFILE_LABELS[profileId]}` : "Без демо-профиля"}</span>
    {savedCount > 0 && <span>Сохранено: {savedCount}</span>}{dismissedCount > 0 && <span>Скрыто: {dismissedCount}</span>}
    {!budgetInvalid && filters.maxSpendKzt !== null && <small>Неизвестные цены исключаются.</small>}
    {filters.openNow && <small>Неизвестные часы исключаются; фактическую работу уточните у места.</small>}
  </div>;
}
