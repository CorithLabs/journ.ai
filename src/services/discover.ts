/**
 * Finding things on the map instead of only drawing what is already planned.
 *
 * Until now the map could show where your decisions were, and nothing else —
 * a list can do everything it did except measure the distance between two
 * stops. This is the map earning its own tab: places you have not thought of
 * yet, in the area you are looking at, that you can put straight into a day.
 *
 * It also attacks the map's other complaint from the other end. An activity
 * with a name that will not geocode is invisible there; a place picked off the
 * map arrives with its name, its coordinates and its address already settled,
 * with nothing left to resolve.
 *
 * Overpass rather than Photon: Photon is a text search and needs something to
 * search for, while "every attraction in this rectangle" has no query term at
 * all. Querying OSM by tag within a bounding box is exactly what Overpass is
 * for. It is a free community service, so this asks only when a filter is
 * switched on, refuses to ask about an area too large to be a sensible
 * question, and caches what comes back.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export type DiscoverCategoryId = 'landmarks' | 'nature';

export interface DiscoverCategory {
  id: DiscoverCategoryId;
  label: string;
  /** OSM key/value pairs that count as this category. */
  tags: Array<[string, string]>;
}

export const DISCOVER_CATEGORIES: DiscoverCategory[] = [
  {
    id: 'landmarks',
    label: 'Landmarks',
    tags: [
      ['tourism', 'attraction'],
      ['tourism', 'museum'],
      ['tourism', 'viewpoint'],
      ['tourism', 'gallery'],
      ['historic', 'monument'],
      ['historic', 'memorial'],
      ['historic', 'castle'],
    ],
  },
  {
    id: 'nature',
    label: 'Parks & beaches',
    // OSM's strongest category, and the one that started this: "Kitsilano
    // Beach" is here and was not in Mapbox.
    tags: [
      ['leisure', 'park'],
      ['leisure', 'garden'],
      ['leisure', 'nature_reserve'],
      ['natural', 'beach'],
      ['natural', 'peak'],
    ],
  },
];

/** [west, south, east, north] */
export type BBox = [number, number, number, number];

/**
 * The largest area worth asking about, as a diagonal in km.
 *
 * Two reasons, and both matter. A rectangle covering a whole province returns
 * either a timeout or a thousand pins that mean nothing at that zoom — and it
 * is an unfair question to put to a free shared service.
 */
export const MAX_SEARCH_DIAGONAL_KM = 40;

/** How many results to accept, so one dense city cannot flood the map. */
const RESULT_LIMIT = 60;

export interface DiscoveredPlace {
  /** OSM type and id, stable enough to dedupe and to key a list by. */
  id: string;
  name: string;
  category: DiscoverCategoryId;
  coordinates: [number, number];
  /** What kind of thing it is, e.g. "museum" — shown as a small label. */
  kind: string;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** How big the visible area is, corner to corner. */
export function bboxDiagonalKm([w, s, e, n]: BBox): number {
  return haversineKm([w, s], [e, n]);
}

/** Whether this area is a sensible thing to ask about at all. */
export function isSearchableArea(bbox: BBox): boolean {
  return bboxDiagonalKm(bbox) <= MAX_SEARCH_DIAGONAL_KM;
}

/**
 * The Overpass query for one category in one rectangle.
 *
 * Ways as well as nodes, because a park is an area and not a point — `out
 * center` gives each one a point to pin. Exported so the query itself can be
 * checked rather than only its results.
 */
export function buildOverpassQuery(category: DiscoverCategory, bbox: BBox): string {
  const [w, s, e, n] = bbox;
  const area = `(${s},${w},${n},${e})`;
  const clauses = category.tags
    .flatMap(([k, v]) => [`node["${k}"="${v}"]${area};`, `way["${k}"="${v}"]${area};`])
    .join('');
  return `[out:json][timeout:20];(${clauses});out center ${RESULT_LIMIT};`;
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

/** In-memory only: a session's worth, thrown away with the tab. */
const cache = new Map<string, DiscoveredPlace[]>();

/** Rounded, so nudging the map by a few metres is not a new question. */
function cacheKey(category: DiscoverCategoryId, bbox: BBox): string {
  return `${category}:${bbox.map((n) => n.toFixed(2)).join(',')}`;
}

/**
 * Places of one category inside a rectangle.
 *
 * Never rejects. Overpass is shared and sometimes busy, and a discovery layer
 * failing must leave the map exactly as it was rather than putting an error in
 * front of someone who was only browsing.
 */
export async function discoverPlaces(
  category: DiscoverCategory,
  bbox: BBox,
  signal?: AbortSignal,
): Promise<DiscoveredPlace[]> {
  if (!isSearchableArea(bbox)) return [];

  const key = cacheKey(category.id, bbox);
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(buildOverpassQuery(category, bbox))}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal,
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { elements?: OverpassElement[] };

    const seen = new Set<string>();
    const places: DiscoveredPlace[] = [];
    for (const el of data.elements ?? []) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const name = el.tags?.name?.trim();
      // A place with no name is a shape on a map with nothing to call it, and
      // would go onto a card as a blank activity.
      if (!name || typeof lat !== 'number' || typeof lon !== 'number') continue;

      /*
       * A park mapped as both a node and a way is one park. Deduped by name
       * and rough position rather than by id, because the two records have
       * different ids and both come back.
       */
      const dedupe = `${name.toLowerCase()}@${lat.toFixed(3)},${lon.toFixed(3)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const [k, v] = category.tags.find(([tk, tv]) => el.tags?.[tk] === tv) ?? [];
      places.push({
        id: `${el.type ?? 'node'}/${el.id ?? dedupe}`,
        name,
        category: category.id,
        coordinates: [lon, lat],
        kind: (v ?? k ?? '').replace(/_/g, ' '),
      });
    }

    cache.set(key, places);
    return places;
  } catch {
    return [];
  }
}

/** For tests, and for a fresh look after the data has plainly changed. */
export function clearDiscoverCache(): void {
  cache.clear();
}
