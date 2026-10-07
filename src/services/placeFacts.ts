import { photonSearch } from './photon';

/**
 * What is known about a place, from sources that can be checked.
 *
 * Two free, keyless sources, and nothing made up:
 *
 *   - Wikipedia, for what the place is. Found by position first — the
 *     articles within a kilometre of the pin, matched on name — so "Meiji
 *     Shrine" in Shibuya is the shrine, not the Meiji era.
 *   - OpenStreetMap, for the practical details people actually check,
 *     found with Photon and read from the OSM API (which answers in under
 *     a second, where the Overpass query servers can take twenty):
 *     opening hours, entry fee, wheelchair access, website, phone, and the
 *     name in the local script, which is what to show a taxi driver.
 *
 * Both are best-effort. A place with no article and no map details simply
 * has no facts, and the AI guide says less rather than more.
 */

export interface WikiFacts {
  title: string;
  /** The article's opening paragraph, as plain text. */
  extract: string;
  url: string;
  image?: string;
}

export interface MapFacts {
  /** OSM opening_hours, as written — e.g. "Mo-Su 09:00-17:00". */
  openingHours?: string;
  website?: string;
  phone?: string;
  /** "yes", "no", or an amount. */
  fee?: string;
  wheelchair?: string;
  cuisine?: string;
  /** What kind of place: "museum", "place of worship", "restaurant"… */
  kind?: string;
  /** The name as it is written locally, when that differs: 明治神宮. */
  localName?: string;
}

export interface PlaceFacts {
  wiki?: WikiFacts;
  map?: MapFacts;
  /** ISO time the facts were gathered, so the card can say how old they are. */
  checkedAt: string;
}

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
/** Read one record's tags. Fast, keyless and dependable, unlike the query servers. */
const OSM_API = 'https://api.openstreetmap.org/api/0.6';
/** How far the map record may be from the activity's pin. */
const NEAR_KM = 1.5;

/** Words that describe a visit rather than name a place. */
const GENERIC = new Set([
  'visit', 'tour', 'trip', 'walk', 'lunch', 'dinner', 'breakfast', 'brunch', 'drinks', 'return',
  'explore', 'morning', 'afternoon', 'evening', 'night', 'from', 'with', 'around', 'near',
  'temple', 'shrine', 'museum', 'park', 'garden', 'market', 'street', 'station', 'tower', 'castle',
  'church', 'cathedral', 'palace', 'beach', 'falls', 'bridge', 'square', 'hall', 'gallery',
]);

function words(text: string): string[] {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
}

/**
 * Whether `candidate` is plausibly the place called `name`.
 *
 * At least one distinctive word must match — "Meiji" in "Meiji Shrine" —
 * since "Shrine" alone would match every shrine in Japan. A name with no
 * distinctive word ("The Temple") falls back to its ordinary words.
 */
export function sameNamedPlace(name: string, candidate: string, ignore: string[] = []): boolean {
  // The neighbourhood and city are where it is, not what it is called:
  // "Ichiran Shibuya" is not the Shibuya Crossing.
  const skip = new Set(ignore.flatMap(words));
  const wanted = words(name).filter((w) => !skip.has(w));
  const distinctive = wanted.filter((w) => !GENERIC.has(w));
  const pool = distinctive.length ? distinctive : wanted;
  const hits = pool.filter((w) => hasWord(candidate, w)).length;
  return hits > 0 && hits * 2 >= pool.length;
}

/**
 * Whether a name contains a word, allowing for how it is split: "Gyoen" is
 * in "Shinjuku Gyo-en", "Sensoji" in "Sensō-ji".
 */
function hasWord(candidate: string, word: string): boolean {
  const parts = words(candidate);
  if (parts.includes(word)) return true;
  const compact = candidate.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return word.length >= 5 && compact.includes(word);
}

/**
 * How closely `candidate` is named like `name`, for ranking the ones that
 * match. Extra words count against it, so "Meiji Shrine" beats "Meiji Shrine
 * Museum" and "Meiji Shrine Inner Garden" when all three are nearby.
 */
export function nameScore(name: string, candidate: string, ignore: string[] = []): number {
  if (!sameNamedPlace(name, candidate, ignore)) return -Infinity;
  const skip = new Set(ignore.flatMap(words));
  const wanted = new Set(words(name).filter((w) => !skip.has(w)));
  const have = words(candidate).filter((w) => !skip.has(w));
  const matched = have.filter((w) => wanted.has(w)).length;
  /*
   * A different kind of place is a different place: asked for a shrine, the
   * shrine's museum is not it. Only when the activity says what kind it is —
   * "Shinjuku Gyoen" says nothing, so its garden and its museum tie, and
   * size decides.
   */
  const kindsAsked = [...wanted].filter((w) => GENERIC.has(w));
  const otherKind = kindsAsked.length > 0 && have.some((w) => GENERIC.has(w) && !wanted.has(w));
  return matched - (otherKind ? 1 : 0);
}

/** The name in the local script, when the record mixes scripts: "Храм Сенсодзи 金龍山 浅草寺" → "金龍山 浅草寺". */
function localPart(name: string): string {
  const cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
  if (!cjk.test(name)) return name;
  const kept = name.split(/\s+/).filter((part) => cjk.test(part));
  return kept.length ? kept.join(' ') : name;
}

async function json<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const resp = await fetch(url, init);
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

/** The article for a place: nearest matching one to the pin, else by name. */
async function findArticle(name: string, at: [number, number] | undefined, city: string | undefined, ignore: string[]): Promise<string | null> {
  if (at) {
    const params = new URLSearchParams({
      action: 'query', list: 'geosearch', gscoord: `${at[1]}|${at[0]}`, gsradius: '1000',
      gslimit: '15', format: 'json', origin: '*',
    });
    const near = await json<{ query?: { geosearch?: Array<{ title: string; dist: number }> } }>(`${WIKI_API}?${params}`);
    const hit = (near?.query?.geosearch ?? [])
      .map((g) => ({ g, score: nameScore(name, g.title, ignore) }))
      .filter(({ score }) => score > -Infinity)
      .sort((a, b) => b.score - a.score || a.g.dist - b.g.dist)[0];
    if (hit) return hit.g.title;
  }
  // No pin, or nothing near it by that name: search, and still insist on the name.
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: city ? `${name} ${city}` : name,
    srlimit: '5', format: 'json', origin: '*',
  });
  const found = await json<{ query?: { search?: Array<{ title: string }> } }>(`${WIKI_API}?${params}`);
  return (found?.query?.search ?? []).find((s) => sameNamedPlace(name, s.title, ignore))?.title ?? null;
}

async function wikiFacts(name: string, at: [number, number] | undefined, city: string | undefined, ignore: string[]): Promise<WikiFacts | undefined> {
  const title = await findArticle(name, at, city, ignore);
  if (!title) return undefined;
  const s = await json<{
    type?: string; title?: string; extract?: string;
    content_urls?: { desktop?: { page?: string } };
    thumbnail?: { source?: string };
  }>(WIKI_SUMMARY + encodeURIComponent(title.replace(/ /g, '_')));
  if (!s?.extract || s.type === 'disambiguation') return undefined;
  return {
    title: s.title ?? title,
    extract: s.extract,
    url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    image: s.thumbnail?.source,
  };
}

function kindOf(tags: Record<string, string>): string | undefined {
  const raw = tags.tourism ?? tags.amenity ?? tags.historic ?? tags.leisure ?? tags.shop ?? tags.natural ?? tags.waterway;
  return raw && raw !== 'yes' ? raw.replace(/_/g, ' ') : undefined;
}

/** Records about getting to or around a place, not the place. */
const NOT_THE_PLACE = /^(highway|public_transport|railway|emergency|information|tourism:information|amenity:parking|amenity:bus_station)/;

function km(a: [number, number], b: [number, number]): number {
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLng = (b[0] - a[0]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * The place's own OpenStreetMap record, and what its tags say.
 *
 * Found with Photon, the search the app already uses, then read whole from
 * the OpenStreetMap API. The search ranks by name, so a small "Meiji Shrine"
 * in Chiba can come before the one in Shibuya; only records near the pin
 * count, nearest first.
 */
async function mapFacts(name: string, at: [number, number], ignore: string[]): Promise<MapFacts | undefined> {
  const hit = (await photonSearch(name, { proximity: at, limit: 8 }))
    .filter((h) => h.osm && !NOT_THE_PLACE.test(h.kind))
    .filter((h) => sameNamedPlace(name, h.name, ignore))
    .map((h) => ({ h, d: km(at, h.coordinates), score: nameScore(name, h.name, ignore) }))
    .filter(({ d }) => d <= NEAR_KM)
    // Best named first; then the larger feature — the garden, not the museum
    // inside it; then the nearest.
    .sort((x, y) => y.score - x.score || (y.h.size ?? 0) - (x.h.size ?? 0) || x.d - y.d)[0]?.h;
  if (!hit?.osm) return undefined;

  const data = await json<{ elements?: Array<{ tags?: Record<string, string> }> }>(
    `${OSM_API}/${hit.osm.type}/${hit.osm.id}.json`,
  );
  const t = data?.elements?.[0]?.tags;
  if (!t) return undefined;

  const english = t['name:en'];
  const localName = t.name && english && t.name !== english ? localPart(t.name) : undefined;
  const facts: MapFacts = {
    openingHours: t.opening_hours,
    website: t.website ?? t['contact:website'],
    phone: t.phone ?? t['contact:phone'],
    fee: t.fee ?? t.charge,
    wheelchair: t.wheelchair,
    cuisine: t.cuisine?.replace(/_/g, ' ').replace(/;/g, ', '),
    kind: kindOf(t),
    localName,
  };
  return Object.values(facts).some(Boolean) ? facts : undefined;
}

/**
 * Everything the free sources say about a place. Never rejects; a place
 * with nothing found comes back with neither source.
 */
export async function fetchPlaceFacts(place: {
  name: string;
  coordinates?: [number, number];
  city?: string;
  /** The location as written, "Shibuya, Tokyo": where it is, not what it is called. */
  location?: string;
}): Promise<PlaceFacts> {
  const name = place.name.trim();
  const ignore = [place.city, ...(place.location ?? '').split(',')]
    .filter((x): x is string => !!x && !!x.trim())
    // A location that is just the place's own name ("Senso-ji") is not a
    // neighbourhood. "Shibuya" for "Ichiran Shibuya" still is.
    .filter((x) => {
      const own = words(name).filter((w) => !GENERIC.has(w));
      const there = new Set(words(x));
      return !(own.length && own.every((w) => there.has(w)));
    });
  const [wiki, map] = await Promise.all([
    name ? wikiFacts(name, place.coordinates, place.city, ignore) : Promise.resolve(undefined),
    name && place.coordinates ? mapFacts(name, place.coordinates, ignore) : Promise.resolve(undefined),
  ]);
  return { wiki, map, checkedAt: new Date().toISOString() };
}
