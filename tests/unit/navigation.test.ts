import { describe, expect, it } from "vitest";
import fixtures from "../../evals/fixtures/places.json";
import { PoiSchema, type Poi } from "@/lib/contracts/poi";
import { buildNavigationLinks } from "@/lib/navigation";

const branchId = "70000001018062580";
function place(overrides: Partial<Poi> = {}): Poi {
  return PoiSchema.parse({
    ...structuredClone(fixtures.places[0]),
    id: `2gis:${branchId}`,
    name: "Один бренд — выбранный филиал",
    location: { lat: 51.128918, lon: 71.406196 },
    links: { twoGis: `https://2gis.kz/astana/firm/${branchId}`, website: null, social: [] },
    ...overrides,
  });
}
function twoGisUrl(poi: Poi, mode: "walking" | "driving") {
  const value = buildNavigationLinks(poi, mode).twoGis;
  expect(value).toBeTypeOf("string");
  return new URL(value!);
}
function destination(url: URL) {
  return decodeURIComponent(url.pathname).split("/points/")[1];
}

describe("destination-only HTTPS navigation to the selected catalogue POI", () => {
  it.each(["walking", "driving"] as const)("Google %s preserves latitude,longitude without borrowing the 2GIS ID", (mode) => {
    const url = new URL(buildNavigationLinks(place(), mode).googleMaps);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("51.128918,71.406196");
    expect(url.searchParams.get("travelmode")).toBe(mode);
    expect(url.searchParams.has("origin")).toBe(false);
    expect(url.searchParams.has("destination_place_id")).toBe(false);
    expect(url.username).toBe(""); expect(url.password).toBe("");
  });

  it.each([["walking", "pedestrian"], ["driving", "car"]] as const)("2GIS %s preserves longitude,latitude and the exact branch string", (mode, providerMode) => {
    const url = twoGisUrl(place(), mode);
    expect(url.protocol).toBe("https:");
    expect(["2gis.ru", "2gis.kz"]).toContain(url.hostname);
    expect(decodeURIComponent(url.pathname)).toContain(`/directions/tab/${providerMode}/points/`);
    expect(destination(url)).toBe("|71.406196,51.128918;70000001018062580");
    expect(url.searchParams.has("origin")).toBe(false);
    expect(url.username).toBe(""); expect(url.password).toBe("");
  });

  it("keeps two same-name branch IDs above2^53 distinct, including the final digit", () => {
    const first = place();
    const second = place({ id: "2gis:70000001018062581", location: { lat: 51.15, lon: 71.45 }, links: { twoGis: "https://2gis.kz/astana/firm/70000001018062581", website: null, social: [] } });
    expect(destination(twoGisUrl(first, "walking"))).toBe("|71.406196,51.128918;70000001018062580");
    expect(destination(twoGisUrl(second, "walking"))).toBe("|71.45,51.15;70000001018062581");
    expect(new URL(buildNavigationLinks(second, "driving").googleMaps).searchParams.get("destination")).toBe("51.15,71.45");
  });

  it("uses the POI coordinates without a branch ID when the listing identifies another branch", () => {
    const poi = place({ links: { twoGis: "https://2gis.kz/astana/firm/70000001018062581", website: null, social: [] } });
    expect(destination(twoGisUrl(poi, "walking"))).toBe("|71.406196,51.128918");
  });

  it("keeps both maps available when the POI has no 2GIS listing", () => {
    const poi = place({ links: { twoGis: null, website: null, social: [] } });
    expect(destination(twoGisUrl(poi, "walking"))).toBe("|71.406196,51.128918");
    expect(new URL(buildNavigationLinks(poi, "walking").googleMaps).searchParams.get("destination")).toBe("51.128918,71.406196");
  });

  it("does not assign an unverified 2GIS object ID to a POI from a different namespace", () => {
    expect(destination(twoGisUrl(place({ id: "osm:node-123" }), "driving"))).toBe("|71.406196,51.128918");
  });

  it.each([
    "https://2gis.kz.evil.test/astana/firm/70000001018062580",
    "https://user:pass@2gis.kz/astana/firm/70000001018062580",
    "http://2gis.kz/astana/firm/70000001018062580",
    "javascript:alert(1)",
    "https://2gis.kz/astana/firm/70000001018062580/another-branch",
  ])("never imports an unsafe listing URL into the route: %s", (listing) => {
    const poi = { ...place(), links: { ...place().links, twoGis: listing } } as Poi;
    const url = twoGisUrl(poi, "walking");
    expect(["2gis.ru", "2gis.kz"]).toContain(url.hostname);
    expect(url.protocol).toBe("https:");
    expect(destination(url)).toBe("|71.406196,51.128918");
  });

  it.each([{ lat: 0, lon: 0 }, { lat: -33.8, lon: -151.2 }])("supports signed/zero coordinates %j without swapping axes", (location) => {
    const poi = place({ location });
    expect(new URL(buildNavigationLinks(poi, "walking").googleMaps).searchParams.get("destination")).toBe(`${location.lat},${location.lon}`);
    expect(destination(twoGisUrl(poi, "walking"))).toBe(`|${location.lon},${location.lat};${branchId}`);
  });

  it.each([
    { lat: NaN, lon: 71.4 }, { lat: Infinity, lon: 71.4 }, { lat: 51.1, lon: -Infinity },
    { lat: 90.1, lon: 71.4 }, { lat: -90.1, lon: 71.4 }, { lat: 51.1, lon: 180.1 }, { lat: 51.1, lon: -180.1 },
  ])("rejects unsafe destination coordinates before building links: %j", (location) => {
    expect(() => buildNavigationLinks({ ...place(), location }, "walking")).toThrow();
  });

  it("does not allow a runtime mode value to inject a URL path", () => {
    expect(() => buildNavigationLinks(place(), "../../evil" as "walking")).toThrow();
  });

  it("does not mutate the selected POI or derive a destination from its name", () => {
    const poi = place({ name: "Бренд &origin=0,0 #другой филиал" });
    const before = structuredClone(poi);
    const links = buildNavigationLinks(poi, "walking");
    expect(new URL(links.googleMaps).searchParams.get("destination")).toBe("51.128918,71.406196");
    expect(poi).toEqual(before);
  });
});
