import type { Coordinates, Poi } from "../contracts/poi";
import type { Intent } from "../contracts/request";
import { haversineMeters } from "../geo";

export type VisitMinutes = { min: number; max: number; isEstimate: true };

const VISIT_BOUNDS: Readonly<Record<Poi["category"], readonly [number, number]>> = {
  cafe: [20, 40], restaurant: [30, 60], park: [20, 60], museum: [40, 90],
  bowling: [45, 90], entertainment: [30, 60], other: [20, 45],
};
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const weekdays: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const localClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function clockMinutes(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesIntoLocalWeek(now: Date): number {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid server time is required.");
  const parts = Object.fromEntries(localClock.formatToParts(now).map((part) => [part.type, part.value]));
  return weekdays[parts.weekday] * MINUTES_PER_DAY + Number(parts.hour) * 60 + Number(parts.minute)
    + Number(parts.second) / 60 + now.getUTCMilliseconds() / 60_000;
}

/** Null means unknown hours, zero means known closed, positive is time to an actual closing gap. */
function remainingOpenMinutes(hours: Poi["hours"], now: Date): number | null {
  const minute = minutesIntoLocalWeek(now);
  if (hours === null) return null;
  const intervals: { start: number; end: number }[] = [];
  for (const offset of [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK]) {
    hours.weekly.forEach((interval) => {
      const day = offset + interval.weekday * MINUTES_PER_DAY;
      intervals.push({
        start: day + clockMinutes(interval.opens),
        end: day + clockMinutes(interval.closes) + (interval.overnight ? MINUTES_PER_DAY : 0),
      });
    });
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  const active = merged.find((interval) => interval.start <= minute && minute < interval.end);
  return active ? active.end - minute : 0;
}

export function estimateVisitMinutes(poi: Poi, intent: Intent, now: Date): VisitMinutes | null {
  const remaining = remainingOpenMinutes(poi.hours, now);
  if (remaining === 0 || (remaining === null && intent.openNow)) return null;
  const [min, categoryMax] = VISIT_BOUNDS[poi.category];
  const max = Math.floor(Math.min(categoryMax, intent.durationMinutes, remaining ?? Infinity));
  return max >= min ? { min, max, isEstimate: true } : null;
}

export function filterCandidates(pois: Poi[], intent: Intent, origin: Coordinates, now: Date): Poi[] {
  // Validate origin even for an empty catalogue; no fabricated center fallback.
  haversineMeters(origin, origin);
  return pois.filter((poi) => {
    if (intent.categories.length && !intent.categories.includes(poi.category)) return false;
    if (haversineMeters(origin, poi.location) > intent.radiusM) return false;
    if (intent.maxSpendKzt !== null && (poi.price === null || poi.price.max > intent.maxSpendKzt)) return false;
    if (!intent.requiredFacts.every((key) => poi.facts.some((fact) => fact.key === key && fact.value && fact.confidence === "confirmed"))) return false;
    return estimateVisitMinutes(poi, intent, now) !== null;
  });
}
