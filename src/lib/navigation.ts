import { CoordinatesSchema, type Poi } from "./contracts/poi";

/** Pure, destination-only HTTPS links. Coordinates and branch identity come from POI. */
export function buildNavigationLinks(poi: Poi, mode: "walking" | "driving"): { twoGis: string; googleMaps: string } {
  if (mode !== "walking" && mode !== "driving") throw new RangeError("Unsupported route mode");
  const { lat, lon } = CoordinatesSchema.parse(poi.location);
  const google = new URL("https://www.google.com/maps/dir/");
  google.searchParams.set("api", "1");
  google.searchParams.set("destination", `${lat},${lon}`);
  google.searchParams.set("travelmode", mode);
  const stableBranch = /^2gis:(\d+)$/.exec(poi.id)?.[1];
  let branch: string | undefined;
  if (stableBranch && poi.links.twoGis) {
    try {
      const listing = new URL(poi.links.twoGis);
      const listingBranch = /^\/(?:astana\/)?firm\/(\d+)\/?$/.exec(listing.pathname)?.[1];
      if (listing.protocol === "https:" && !listing.username && !listing.password
        && ["2gis.ru", "2gis.kz"].includes(listing.hostname) && listingBranch === stableBranch) branch = stableBranch;
    } catch { /* An unverified listing never contributes a branch ID. */ }
  }
  const destination = `${lon},${lat}${branch ? `;${branch}` : ""}`;
  return {
    twoGis: `https://2gis.ru/astana/directions/tab/${mode === "walking" ? "pedestrian" : "car"}/points/%7C${destination}`,
    googleMaps: google.toString(),
  };
}
