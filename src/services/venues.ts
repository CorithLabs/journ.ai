import { getMapboxToken, haversineKm } from './mapbox';
import { photonSearch } from './photon';

/**
 * A place you can pick instead of a place we had to guess at.
 *
 * Typing "Ichiran" into the location field and letting the geocoder resolve it
 * later means accepting whichever of the eighty branches Mapbox ranks highest.
 * Choosing one from a list settles the question at the moment the activity is
 * written down, and carries the coordinates with it so nothing is looked up
 * again.
 */
export interface VenueSuggestion {
  /** The venue's own name — short enough to read on a card. */
  name: string;
  /** The full formatted address, which is what makes two branches tell apart. */
  address: string;
  coordinates: [number, number];
}

interface MapboxFeature {
  text?: string;
  place_name?: string;
  center?: [number, number];
}

/**
 * How far a venue result may sit from the city being searched around, in km.
 *
 * Tighter than the itinerary's own 300km guard: that one has to allow a day
 * trip the traveller deliberately planned, while this is a list of things to
 * pick from, and a restaurant three cities away is never the answer.
 */
const VENUE_RADIUS_KM = 100;

/**
 * Venues matching a partial name, nearest the trip first.
 *
 * Asks for points of interest *and* addresses, because coverage is uneven: a
 * restaurant in Tokyo or Montreal is in the POI index, while a small place in
 * Gaspé may only exist as the street it is on. An address you can accept beats
 * an empty list.
 *
 * Never rejects. A missing token, a network failure or a bad response all
 * return nothing, so the field stays a plain text box and the activity can
 * still be written down — the same bargain the destination search makes.
 */
export async function searchVenues(
  query: string,
  options: { proximity?: [number, number]; context?: string; signal?: AbortSignal } = {},
): Promise<VenueSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  /*
   * With no Mapbox token there is still OpenStreetMap, which needs none.
   *
   * This used to return nothing at all, so the venue picker — the whole point
   * of which is not having to get a location right by typing — was switched
   * off for exactly the people who had not set an API key up.
   */
  const token = getMapboxToken();
  if (!token) return fromOpenStreetMap(trimmed, options);

  try {
    const params = new URLSearchParams({
      access_token: token,
      types: 'poi,address',
      limit: '6',
      language: 'en',
    });
    if (options.proximity) {
      params.set('proximity', `${options.proximity[0]},${options.proximity[1]}`);
    }
    /*
     * The city is appended rather than relied on through proximity alone.
     * Proximity only ranks — a query with no local match still returns the
     * far-away one, which is the same trap that put itinerary pins on other
     * continents.
     */
    const ctx = options.context?.trim();
    const q =
      ctx && !trimmed.toLowerCase().includes(ctx.split(',')[0].trim().toLowerCase())
        ? `${trimmed}, ${ctx}`
        : trimmed;

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`;
    const resp = await fetch(url, { signal: options.signal });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { features?: MapboxFeature[] };

    const hits = (data.features ?? [])
      .filter((f): f is MapboxFeature & { center: [number, number] } =>
        Array.isArray(f.center) && f.center.length === 2)
      .filter((f) =>
        !options.proximity || haversineKm(options.proximity, f.center) <= VENUE_RADIUS_KM)
      .map((f) => ({
        name: f.text?.trim() || f.place_name?.split(',')[0].trim() || trimmed,
        address: f.place_name?.trim() || '',
        coordinates: f.center,
      }))
      .filter((v) => v.name);

    // An empty list is where the beaches and parks went. OSM carries the named
    // geography Mapbox is thinnest on, so it gets asked before the field gives
    // up — and only then, so the common case still costs one request.
    return hits.length ? hits : await fromOpenStreetMap(trimmed, options);
  } catch {
    return [];
  }
}

/** The same search, asked of OpenStreetMap, held to the same radius. */
async function fromOpenStreetMap(
  query: string,
  options: { proximity?: [number, number]; signal?: AbortSignal },
): Promise<VenueSuggestion[]> {
  const hits = await photonSearch(query, {
    proximity: options.proximity,
    limit: 6,
    signal: options.signal,
  });
  return hits
    .filter((h) =>
      !options.proximity || haversineKm(options.proximity, h.coordinates) <= VENUE_RADIUS_KM)
    .map((h) => ({ name: h.name, address: h.address, coordinates: h.coordinates }));
}
