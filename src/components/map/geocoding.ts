/**
 * Calculates the straight-line (Haversine) distance in km between two [lng, lat] points.
 */
export function haversineKm(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlng = Math.sin(dLng / 2);
  const h =
    sinDlat * sinDlat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDlng * sinDlng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Calculates total sequential route distance for a list of coordinates.
 */
export function totalRouteDistance(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineKm(coords[i], coords[i + 1]);
  }
  return total;
}
