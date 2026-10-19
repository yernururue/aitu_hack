import type { Coordinates } from "./contracts/poi";

const EARTH_RADIUS_M = 6_371_000;

function assertCoordinates(point: Coordinates) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) {
    throw new RangeError("Coordinates must be finite latitude/longitude values within their valid ranges.");
  }
}

/** Great-circle distance in meters; this is not a road or walking route. */
export function haversineMeters(origin: Coordinates, destination: Coordinates): number {
  assertCoordinates(origin);
  assertCoordinates(destination);
  const radians = Math.PI / 180;
  const dLat = (destination.lat - origin.lat) * radians;
  const dLon = (destination.lon - origin.lon) * radians;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(origin.lat * radians) * Math.cos(destination.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
