/**
 * OpenStreetMap search, for the places Mapbox does not carry.
 *
 * "Kitsilano Beach, Vancouver" is the case that prompted this: Mapbox returned
 * nothing usable, Google found it instantly, and OSM has had it named for
 * years. That is the shape of the gap — beaches, parks, viewpoints, trails and
 * other named geography are where OSM is strongest and Mapbox thinnest.
 *
 * It is a fallback rather than a replacement, because the gap runs both ways:
 * Mapbox and Google are better on commercial POIs — chains, hotels, shops —
 * and swapping outright would fix a beach and break a ramen shop. Asking the
 * second one only when the first found nothing roughly doubles the recall for
 * one extra request, paid only on the failures.
 *
 * Photon rather than Nominatim: Nominatim's usage policy caps callers at one
 * request per second and asks that it not be used for autocomplete, which is
 * most of what this app needs a geocoder for. Photon is built for as-you-type
 * search and needs no key. It is still a free community service — every call
 * here is either a user keystroke that already debounced, or a retry after a
 * miss, and nothing polls it.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';

export interface PhotonPlace {
  /** The place's own name, or its street address when it has no name. */
  name: string;
  /** As full an address as the properties allow. */
  address: string;
  coordinates: [number, number];
  /** The OSM tag it matched, e.g. "leisure:beach_resort". */
  kind: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

/**
 * An address out of the parts, since Photon returns no formatted one.
 *
 * Ordered outward from the building. Blank parts are dropped rather than
 * leaving the double commas that give away a template.
 */
function formatAddress(p: NonNullable<PhotonFeature['properties']>): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  return [street, p.district, p.city ?? p.county, p.state, p.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

export interface PhotonOptions {
  /** Bias results toward this point. */
  proximity?: [number, number];
  limit?: number;
  /**
   * OSM tags to restrict to, e.g. `['tourism:attraction', 'amenity:restaurant']`.
   * Without one, everything matching the text comes back.
   */
  osmTags?: string[];
  signal?: AbortSignal;
}

/**
 * Places matching a query, from OpenStreetMap.
 *
 * Never rejects. A network failure or a bad response returns nothing, because
 * this is the second thing asked and its silence must look like the first
 * one's — a location that cannot be found, not an error the user has to deal
 * with.
 */
export async function photonSearch(
  query: string,
  options: PhotonOptions = {},
): Promise<PhotonPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const params = new URLSearchParams({
      q: trimmed,
      limit: String(options.limit ?? 5),
      lang: 'en',
    });
    if (options.proximity) {
      params.set('lon', String(options.proximity[0]));
      params.set('lat', String(options.proximity[1]));
    }
    // Repeated rather than joined: Photon reads one tag per parameter.
    for (const tag of options.osmTags ?? []) params.append('osm_tag', tag);

    const resp = await fetch(`${PHOTON_URL}?${params}`, { signal: options.signal });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { features?: PhotonFeature[] };

    const places: PhotonPlace[] = [];
    for (const f of data.features ?? []) {
      const coords = f.geometry?.coordinates;
      const p = f.properties;
      if (!p || !Array.isArray(coords) || coords.length < 2) continue;

      const address = formatAddress(p);
      // A result with neither a name nor an address is a point on a map with
      // nothing to call it, which is no use on a card.
      const name = p.name?.trim() || address.split(',')[0]?.trim();
      if (!name) continue;

      places.push({
        name,
        address: address || name,
        coordinates: [coords[0], coords[1]],
        kind: [p.osm_key, p.osm_value].filter(Boolean).join(':'),
      });
    }
    return places;
  } catch {
    return [];
  }
}
