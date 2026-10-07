import { haversineKm } from './places';
import { photonSearch } from './photon';

/**
 * A place you can pick instead of a place we had to guess at.
 *
 * Typing "Ichiran" into the location field and letting the geocoder resolve it
 * later means accepting whichever of the eighty branches ranks highest.
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

/**
 * How far a venue result may sit from the city being searched around, in km.
 *
 * Tighter than the itinerary's own 300km guard: that one has to allow a day
 * trip the traveller deliberately planned, while this is a list of things to
 * pick from, and a restaurant three cities away is never the answer.
 */
const VENUE_RADIUS_KM = 100;

/**
 * Venues matching a partial name, nearest the trip first, from OpenStreetMap.
 *
 * OSM carries the named geography — beaches, parks, viewpoints, trails — that
 * the commercial geocoders are thinnest on, and needs no key, so the picker
 * works for everyone rather than only for people who set an API key up.
 *
 * Never rejects. A network failure or a bad response returns nothing, so the
 * field stays a plain text box and the activity can still be written down —
 * the same bargain the destination search makes.
 */
export async function searchVenues(
  query: string,
  options: { proximity?: [number, number]; context?: string; signal?: AbortSignal } = {},
): Promise<VenueSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const hits = await photonSearch(trimmed, {
    proximity: options.proximity,
    limit: 6,
    signal: options.signal,
  });
  return hits
    .filter((h) =>
      !options.proximity || haversineKm(options.proximity, h.coordinates) <= VENUE_RADIUS_KM)
    .map((h) => ({ name: h.name, address: h.address, coordinates: h.coordinates }));
}
