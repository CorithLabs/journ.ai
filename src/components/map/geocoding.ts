/**
 * Geocodes a location name using the Mapbox Geocoding API.
 * Returns [lng, lat] or null if geocoding fails.
 */
export async function geocodeLocation(
  locationName: string,
  mapboxToken: string,
): Promise<[number, number] | null> {
  if (!locationName.trim()) return null;

  try {
    const encoded = encodeURIComponent(locationName.trim());
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&limit=1`;
    const resp = await fetch(url);
    if (!resp.ok) return null;

    const data = (await resp.json()) as {
      features?: Array<{ center: [number, number] }>;
    };

    if (!data.features?.length) return null;
    return data.features[0].center; // [lng, lat]
  } catch {
    return null;
  }
}

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
