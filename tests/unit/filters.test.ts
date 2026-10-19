import { describe, expect, it } from "vitest";
import fixtures from "../../evals/fixtures/places.json";
import { PoiSchema, type Coordinates, type Poi } from "@/lib/contracts/poi";
import type { Intent } from "@/lib/contracts/request";
import { haversineMeters } from "@/lib/geo";
import { filterCandidates } from "@/lib/search/filters";

const origin: Coordinates = { lat: 51.09, lon: 71.42 };
const noonTuesday = new Date("2026-10-20T07:00:00Z"); // 12:00 Asia/Almaty.
const sourceIds = ["source:fixture:quiet-cafe"];

function poi(overrides: Partial<Poi> = {}): Poi {
  return PoiSchema.parse({ ...structuredClone(fixtures.places[0]), id: "fixture:near", location: { ...origin }, hours: null, ...overrides });
}

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    categories: [], radiusM: 2000, durationMinutes: 60, company: "solo", maxSpendKzt: null, openNow: false,
    requiredFacts: [], preferredTags: [], conflict: null, ...overrides,
  };
}

function hours(weekly: NonNullable<Poi["hours"]>["weekly"]): NonNullable<Poi["hours"]> {
  return { timezone: "Asia/Almaty", weekly, sourceIds };
}

function ids(places: Poi[]) { return places.map((place) => place.id); }

describe("straight-line Haversine distance", () => {
  it("returns meters, zero at the same point and symmetric nonzero distances", () => {
    expect(haversineMeters(origin, origin)).toBe(0);
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -1);
    expect(haversineMeters(origin, { lat: 51.1, lon: 71.43 })).toBeCloseTo(haversineMeters({ lat: 51.1, lon: 71.43 }, origin), 6);
  });

  it("keeps antipodal distance finite", () => {
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(20_015_087, -2);
  });

  it.each([
    { lat: NaN, lon: 71.42 }, { lat: 91, lon: 71.42 },
    { lat: 51.09, lon: Infinity }, { lat: 51.09, lon: -181 },
  ])("rejects invalid coordinates %j", (invalid) => {
    expect(() => haversineMeters(origin, invalid)).toThrow();
    expect(() => haversineMeters(invalid, origin)).toThrow();
  });
});

describe("hard catalogue filters", () => {
  it("excludes out-of-radius places before ranking, preserving valid near places", () => {
    const near = poi();
    const far = poi({ id: "fixture:far", location: { lat: 51.11, lon: 71.42 } });
    expect(ids(filterCandidates([far, near], intent({ radiusM: 1000 }), origin, noonTuesday))).toEqual(["fixture:near"]);
  });

  it("keeps an exact coordinate match and applies explicit category constraints", () => {
    expect(ids(filterCandidates([poi(), poi({ id: "fixture:museum", category: "museum" })], intent({ categories: ["museum"] }), origin, noonTuesday))).toEqual(["fixture:museum"]);
  });

  it("requires a known maximum price within the per-person visit budget", () => {
    const unknown = poi({ id: "fixture:unknown", price: null });
    const exact = poi({ id: "fixture:exact", price: { min: 1000, max: 2000, currency: "KZT", basis: "per_person_visit", sourceIds } });
    const over = poi({ id: "fixture:over", price: { min: 1000, max: 2001, currency: "KZT", basis: "per_person_visit", sourceIds } });
    expect(ids(filterCandidates([unknown, over, exact], intent({ maxSpendKzt: 2000 }), origin, noonTuesday))).toEqual(["fixture:exact"]);
  });

  it("does not invent a price when there is no strict budget", () => {
    expect(filterCandidates([poi({ price: null })], intent(), origin, noonTuesday)).toHaveLength(1);
  });

  it("treats a zero budget as an active constraint, admitting only a confirmed free visit", () => {
    const free = poi({ id: "fixture:free", price: { min: 0, max: 0, currency: "KZT", basis: "per_person_visit", sourceIds } });
    expect(ids(filterCandidates([poi(), poi({ id: "fixture:unknown", price: null }), free], intent({ maxSpendKzt: 0 }), origin, noonTuesday))).toEqual(["fixture:free"]);
  });

  it.each([
    ["reported true", [{ key: "outlets", value: true, confidence: "reported", sourceIds }]],
    ["confirmed false", [{ key: "outlets", value: false, confidence: "confirmed", sourceIds }]],
    ["unknown", []],
  ] as const)("does not satisfy required outlets with %s", (_label, facts) => {
    const place = poi({ facts: facts.map((fact) => ({ ...fact, sourceIds: [...fact.sourceIds] })) });
    expect(filterCandidates([place], intent({ requiredFacts: ["outlets"] }), origin, noonTuesday)).toEqual([]);
  });

  it("requires every hard fact and accepts confirmed true for all of them", () => {
    const eligible = poi({ facts: [
      { key: "indoor", value: true, confidence: "confirmed", sourceIds },
      { key: "childFriendly", value: true, confidence: "confirmed", sourceIds },
    ] });
    const missing = poi({ id: "fixture:missing-child", facts: [{ key: "indoor", value: true, confidence: "confirmed", sourceIds }] });
    expect(ids(filterCandidates([missing, eligible], intent({ requiredFacts: ["indoor", "childFriendly"] }), origin, noonTuesday))).toEqual(["fixture:near"]);
  });

  it("does not turn a soft quiet preference into a hard exclusion", () => {
    expect(filterCandidates([poi({ facts: [] })], intent({ preferredTags: ["quiet"] }), origin, noonTuesday)).toHaveLength(1);
  });

  it("returns no matches without widening budget or category constraints", () => {
    const constraints = intent({ categories: ["bowling"], maxSpendKzt: 100 });
    expect(filterCandidates([poi()], constraints, origin, noonTuesday)).toEqual([]);
    expect(constraints).toMatchObject({ categories: ["bowling"], maxSpendKzt: 100 });
  });
});

describe("known and unknown schedules in Asia/Almaty", () => {
  it("allows unknown hours only when openNow is false", () => {
    expect(filterCandidates([poi()], intent({ openNow: false }), origin, noonTuesday)).toHaveLength(1);
    expect(filterCandidates([poi()], intent({ openNow: true }), origin, noonTuesday)).toEqual([]);
  });

  it.each([false, true])("excludes a known closed schedule even when openNow=%s", (openNow) => {
    const closed = poi({ hours: hours([]) });
    expect(filterCandidates([closed], intent({ openNow }), origin, noonTuesday)).toEqual([]);
  });

  it("uses Almaty local time rather than the host clock", () => {
    const place = poi({ hours: hours([{ weekday: 2, opens: "11:30", closes: "13:00", overnight: false }]) });
    expect(filterCandidates([place], intent({ openNow: true }), origin, noonTuesday)).toHaveLength(1);
  });

  it("checks the previous day for an open overnight interval", () => {
    const bowling = PoiSchema.parse(fixtures.places.find((place) => place.id === "fixture:bowling"));
    expect(ids(filterCandidates([bowling], intent({ categories: ["bowling"], openNow: true, durationMinutes: 120 }), origin, new Date("2026-10-20T19:30:00Z")))).toEqual(["fixture:bowling"]);
  });

  it("rejects an overnight venue when too little time remains before closing", () => {
    const bowling = PoiSchema.parse(fixtures.places.find((place) => place.id === "fixture:bowling"));
    expect(filterCandidates([bowling], intent({ openNow: true }), origin, new Date("2026-10-20T20:45:00Z"))).toEqual([]);
  });

  it("wraps the previous-day check from Sunday back to Saturday", () => {
    const place = poi({ hours: hours([{ weekday: 6, opens: "22:00", closes: "02:00", overnight: true }]) });
    expect(filterCandidates([place], intent({ openNow: true }), origin, new Date("2026-10-17T20:30:00Z"))).toHaveLength(1);
  });

  it("recognizes equal opening/closing times with overnight=true as 24 hours", () => {
    const place = poi({ hours: hours([{ weekday: 2, opens: "00:00", closes: "00:00", overnight: true }]) });
    expect(filterCandidates([place], intent({ openNow: true }), origin, noonTuesday)).toHaveLength(1);
  });

  it("keeps a continuously open 24/7 venue across the midnight boundary", () => {
    const place = poi({ category: "museum", hours: hours(Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: "00:00", closes: "00:00", overnight: true }))) });
    expect(filterCandidates([place], intent({ openNow: true }), origin, new Date("2026-10-18T18:50:00Z"))).toHaveLength(1);
  });

  it("allows a visit ending exactly at closing but rejects an insufficient minute", () => {
    const fits = poi({ id: "fixture:fits", hours: hours([{ weekday: 2, opens: "09:00", closes: "12:20", overnight: false }]) });
    const short = poi({ id: "fixture:short", hours: hours([{ weekday: 2, opens: "09:00", closes: "12:19", overnight: false }]) });
    expect(ids(filterCandidates([short, fits], intent(), origin, noonTuesday))).toEqual(["fixture:fits"]);
  });

  it("treats the exact closing instant as closed", () => {
    const place = poi({ hours: hours([{ weekday: 2, opens: "09:00", closes: "12:00", overnight: false }]) });
    expect(filterCandidates([place], intent(), origin, noonTuesday)).toEqual([]);
  });

  it("does not round remaining seconds up to a full minimum visit", () => {
    const place = poi({ hours: hours([{ weekday: 2, opens: "09:00", closes: "12:20", overnight: false }]) });
    expect(filterCandidates([place], intent(), origin, new Date("2026-10-20T07:00:01Z"))).toEqual([]);
  });

  it.each(["museum", "bowling"] as const)("does not shrink %s below its category minimum to fit a 30-minute visit", (category) => {
    expect(filterCandidates([poi({ category })], intent({ durationMinutes: 30 }), origin, noonTuesday)).toEqual([]);
  });
});
