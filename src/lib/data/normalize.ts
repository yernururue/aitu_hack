import { z } from "zod";
import { CatalogSchema, FACT_KEYS, PoiSchema, type Catalog, type Poi } from "../contracts/poi";

const EnvelopeSchema = z.strictObject({ schemaVersion: z.literal("1.0"), synthetic: z.boolean(), places: z.array(z.unknown()).max(10_000) });

export type ImportIssue = { path: string; message: string };
export type ImportRejection = { index: number; id: string | null; reason: "duplicate_id" | "invalid_poi" | "synthetic_provenance"; issues: ImportIssue[] };
export type SuspectedDuplicate = { indexes: [number, number]; reason: "same_name_nearby"; distanceM: number };
export type ImportReport = {
  fetched: number;
  accepted: number;
  rejected: number;
  rejections: ImportRejection[];
  suspectedDuplicates: SuspectedDuplicate[];
  missingFields: Record<string, number>;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  byZone: Record<string, number>;
};

export function normalizePoi(raw: unknown): Poi {
  return PoiSchema.parse(raw);
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function inputId(raw: unknown): string | null {
  const id = object(raw)?.id;
  return typeof id === "string" && id.trim() ? id : null;
}

function coordinateCandidate(raw: unknown) {
  const row = object(raw);
  const location = object(row?.location);
  if (typeof row?.name !== "string" || typeof location?.lat !== "number" || typeof location.lon !== "number") return null;
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon) || Math.abs(location.lat) > 90 || Math.abs(location.lon) > 180) return null;
  return { name: row.name.trim().normalize("NFKC").toLocaleLowerCase("ru"), lat: location.lat, lon: location.lon };
}

function suspectedDuplicates(rows: unknown[]): SuspectedDuplicate[] {
  const candidates = rows.map(coordinateCandidate);
  const result: SuspectedDuplicate[] = [];
  for (let a = 0; a < rows.length; a++) {
    const first = candidates[a];
    if (!first || !first.name) continue;
    for (let b = a + 1; b < rows.length; b++) {
      const second = candidates[b];
      if (!second || first.name !== second.name || (inputId(rows[a]) && inputId(rows[b]))) continue;
      const radians = Math.PI / 180;
      const dLat = (second.lat - first.lat) * radians;
      const dLon = (second.lon - first.lon) * radians;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(first.lat * radians) * Math.cos(second.lat * radians) * Math.sin(dLon / 2) ** 2;
      const distanceM = 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
      if (distanceM <= 50) result.push({ indexes: [a, b], reason: "same_name_nearby", distanceM });
    }
  }
  return result;
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function normalizeCatalog(raw: unknown): { catalog: Catalog; report: ImportReport } {
  const envelope = EnvelopeSchema.parse(raw);
  const counts = new Map<string, number>();
  envelope.places.forEach((row) => {
    const id = inputId(row);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const places: Poi[] = [];
  const rejections: ImportRejection[] = [];
  envelope.places.forEach((row, index) => {
    const id = inputId(row);
    if (id && counts.get(id)! > 1) {
      rejections.push({ index, id, reason: "duplicate_id", issues: [{ path: "id", message: "Every row sharing a duplicate place ID is rejected" }] });
      return;
    }
    const result = PoiSchema.safeParse(row);
    if (!result.success) {
      rejections.push({ index, id, reason: "invalid_poi", issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
      return;
    }
    if (!envelope.synthetic && result.data.sources.some((source) => source.kind === "synthetic")) {
      rejections.push({ index, id, reason: "synthetic_provenance", issues: [{ path: "sources", message: "Synthetic provenance is forbidden in a real catalogue" }] });
      return;
    }
    places.push(result.data);
  });

  const missingFields: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  places.forEach((poi) => {
    for (const key of ["address", "rating", "price", "hours"] as const) if (poi[key] === null) increment(missingFields, key);
    for (const key of ["twoGis", "website"] as const) if (poi.links[key] === null) increment(missingFields, `links.${key}`);
    FACT_KEYS.forEach((key) => { if (!poi.facts.some((fact) => fact.key === key)) increment(missingFields, `facts.${key}`); });
    increment(byCategory, poi.category);
    new Set(poi.sources.map((source) => source.kind)).forEach((kind) => increment(bySource, kind));
  });

  const catalog = CatalogSchema.parse({ schemaVersion: envelope.schemaVersion, synthetic: envelope.synthetic, places });
  return {
    catalog,
    report: {
      fetched: envelope.places.length, accepted: places.length, rejected: rejections.length,
      rejections, suspectedDuplicates: suspectedDuplicates(envelope.places), missingFields, bySource, byCategory,
      byZone: places.length ? { unknown: places.length } : {},
    },
  };
}

export const importCatalog = normalizeCatalog;
