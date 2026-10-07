/**
 * OpenStreetMap search: every place lookup in the app.
 *
 * It started as the fallback for the places Mapbox did not carry — "Kitsilano
 * Beach, Vancouver" found nothing there, and OSM has had it named for years.
 * Beaches, parks, viewpoints and trails are where OSM is strongest, and it
 * needs no key, so it became the only search when Mapbox was removed.
 *
 * Photon rather than Nominatim: Nominatim's usage policy caps callers at one
 * request per second and asks that it not be used for autocomplete, which is
 * most of what this app needs a geocoder for. Photon is built for as-you-type
 * search and needs no key. It is still a free community service — every call
 * here is either a user keystroke that already debounced, or a lookup whose
 * answer is kept on the activity, and nothing polls it.
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
  /** The OpenStreetMap record it came from, to read its full tags. */
  osm?: { type: 'node' | 'way' | 'relation'; id: number };
  /** Rough size of the feature in square degrees; 0 for a point. */
  size?: number;
}

const OSM_TYPE = { N: 'node', W: 'way', R: 'relation' } as const;

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
    osm_type?: string;
    osm_id?: number;
    /** [minLon, maxLat, maxLon, minLat] for ways and relations. */
    extent?: [number, number, number, number];
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
  /**
   * Called when the search could not be made or answered, so a caller can
   * tell "nothing by that name" from "nobody answered".
   */
  onFail?: () => void;
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
    if (!resp.ok) {
      options.onFail?.();
      return [];
    }
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
        // Only when Photon says, so a result without them reads as before.
        ...(p.osm_type && p.osm_type in OSM_TYPE && typeof p.osm_id === 'number'
          ? { osm: { type: OSM_TYPE[p.osm_type as keyof typeof OSM_TYPE], id: p.osm_id } }
          : {}),
        ...(p.extent ? { size: Math.abs((p.extent[2] - p.extent[0]) * (p.extent[1] - p.extent[3])) } : {}),
      });
    }
    return places;
  } catch {
    options.onFail?.();
    return [];
  }
}
