/**
 * src/services/mapbox.ts
 *
 * Shared Mapbox / distance utilities used by the Map tab and route optimisation.
 * `haversineKm` and `totalRouteDistanceKm` are the canonical pure-math functions;
 * do NOT duplicate them elsewhere.
 */

/**
 * Calculates the straight-line (Haversine) distance in kilometres
 * between two [lng, lat] coordinate pairs.
 */
export function haversineKm(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Calculates the total straight-line route distance in kilometres for an ordered
 * array of [lng, lat] coordinate pairs using the Haversine formula.
 *
 * Returns 0 for arrays with fewer than 2 points.
 */
export function totalRouteDistanceKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineKm(coords[i], coords[i + 1]);
  }
  return total;
}
