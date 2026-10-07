/**
 * A photo of a place, for the top of its trip.
 *
 * Wikipedia's page summary carries each article's lead image, which for a city
 * is nearly always a good one — a skyline, an old town, a harbour. It is free,
 * needs no key, and asks nothing of the user, which matters in an app whose
 * other services each want a token pasted in before they work.
 *
 * Found once per place and kept in localStorage, misses included: a town with
 * no usable picture should not be looked up again on every open.
 */

export interface PlacePhoto {
  /** The image itself. */
  src: string;
  /** The article it was taken from, which is also where the credit points. */
  pageUrl: string;
  /** The article's title, used for alt text. */
  title: string;
}

const CACHE_PREFIX = 'aitp_place_photo:';
const FOUND_TTL = 30 * 24 * 60 * 60 * 1000;
// Short, so a lookup that failed because the network did is tried again soon.
const MISSING_TTL = 24 * 60 * 60 * 1000;
/** Wide enough for the hero at 2x, small enough not to drag a phone down. */
const WIDTH = 1280;
/** Under this a lead image is usually a crest or a thumbnail, not a view. */
const MIN_WIDTH = 640;

interface SummaryImage {
  source: string;
  width: number;
  height: number;
}

interface Summary {
  type?: string;
  title?: string;
  originalimage?: SummaryImage;
  thumbnail?: SummaryImage;
  content_urls?: { desktop?: { page?: string } };
}

const inFlight = new Map<string, Promise<PlacePhoto | null>>();

function cacheKey(place: string): string {
  return CACHE_PREFIX + place.trim().toLowerCase();
}

/**
 * What is stored for a place: the photo, null for a known miss, or undefined
 * when nothing is (or the entry has expired) and it is worth looking up.
 */
export function cachedPlacePhoto(place: string, now = Date.now()): PlacePhoto | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(place));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as { at: number; photo: PlacePhoto | null };
    const ttl = entry.photo ? FOUND_TTL : MISSING_TTL;
    if (typeof entry.at !== 'number' || now - entry.at > ttl) return undefined;
    return entry.photo;
  } catch {
    return undefined;
  }
}

function remember(place: string, photo: PlacePhoto | null, now: number): void {
  try {
    localStorage.setItem(cacheKey(place), JSON.stringify({ at: now, photo }));
  } catch {
    // Storage full or blocked: the photo still shows, it is just looked up again.
  }
}

/**
 * The image from a summary worth putting at the top of a trip, or null.
 *
 * Maps, flags and coats of arms are SVGs and are the commonest lead images
 * that are not a view of the place, so those are refused outright.
 */
export function pickImage(summary: Summary): string | null {
  const original = summary.originalimage;
  const thumb = summary.thumbnail;
  if (!original?.source) return null;
  if (/\.svg($|[?/])/i.test(original.source)) return null;
  if (original.width < MIN_WIDTH) return null;

  // Wikimedia serves any width up to the original from the thumbnail path,
  // so the summary's 330px thumbnail can be asked for at the width needed.
  if (original.width > WIDTH && thumb?.source && /\/\d+px-[^/]+$/.test(thumb.source.split('?')[0])) {
    return thumb.source.split('?')[0].replace(/\/\d+px-([^/]+)$/, `/${WIDTH}px-$1`);
  }
  return original.source.split('?')[0];
}

async function lookup(title: string): Promise<PlacePhoto | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return null;
  const summary = (await resp.json()) as Summary;
  // "Victoria" is a list of places, not a place.
  if (summary.type === 'disambiguation') return null;
  const src = pickImage(summary);
  if (!src) return null;
  return {
    src,
    pageUrl: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    title: summary.title ?? title,
  };
}

/**
 * The places to try, most specific first. "Banff, Alberta" is its own article
 * and a better one than "Banff"; "Tokyo, Japan" is not an article at all, and
 * falls back to "Tokyo".
 */
export function photoCandidates(place: string): string[] {
  const full = place.trim();
  const bare = full.split(',')[0].trim();
  return [...new Set([full, bare].filter(Boolean))];
}

/** Find a photo for a place, from the cache when there is one. */
export function fetchPlacePhoto(place: string, now = Date.now()): Promise<PlacePhoto | null> {
  const cached = cachedPlacePhoto(place, now);
  if (cached !== undefined) return Promise.resolve(cached);

  const key = cacheKey(place);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async () => {
    try {
      for (const title of photoCandidates(place)) {
        const photo = await lookup(title);
        if (photo) {
          remember(place, photo, now);
          return photo;
        }
      }
      remember(place, null, now);
      return null;
    } catch {
      // Offline or blocked. Not remembered, so the next open tries again.
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, run);
  return run;
}
