/**
 * Cities, from Open-Meteo's place search.
 *
 * The forecast already comes from Open-Meteo, and the same service will say
 * where a city is — free, no key. That matters more than it sounds: finding the
 * city used to need a Mapbox token, so the weather, which needs no account of
 * its own, was missing for everyone who had not pasted one into Settings.
 *
 * It is a gazetteer of places rather than a search of everything, which is
 * what both callers want: the destination field, and the anchor point each
 * trip city is measured from.
 */

const SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_PREFIX = 'aitp_city:';

export interface City {
  name: string;
  /** State, province or prefecture, when there is one. */
  region: string | null;
  country: string | null;
  /** [lng, lat], the order everything else in the app uses. */
  coordinates: [number, number];
  /** "Banff, Alberta, Canada" — what is shown and stored. */
  label: string;
}

interface OpenMeteoPlace {
  name?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  /** GeoNames feature code: PPL… populated places, PCL… countries, ADM… regions. */
  feature_code?: string;
}

/**
 * Towns, cities, regions and countries — not the airports, mountains and
 * theme parks that share their names ("Tokyo Heliport", "Banff Airport").
 */
function isPlace(code?: string): boolean {
  return !code || /^(PPL|PCL|ADM)/.test(code);
}

function labelOf(p: OpenMeteoPlace): string {
  const name = p.name?.trim() ?? '';
  const region = p.admin1?.trim();
  // A country found by name is its own label: "Japan", not "Japan, Japan".
  const country = p.country?.trim();
  return [name, region && region !== name && region !== country ? region : null, country !== name ? country : null]
    .filter(Boolean)
    .join(', ');
}

/**
 * "Lund, Sweden" → ["lund", ["sweden"]]. The search itself is by name; what
 * follows the comma decides between the Lunds.
 */
function split(query: string): [string, string[]] {
  const [name, ...rest] = query.split(',').map((s) => s.trim()).filter(Boolean);
  return [name ?? '', rest.map((r) => r.toLowerCase())];
}

function matches(p: OpenMeteoPlace, qualifiers: string[]): boolean {
  const fields = [p.country, p.admin1, p.country_code].map((f) => f?.toLowerCase() ?? '');
  return qualifiers.every((q) => fields.some((f) => f && (f === q || f.startsWith(q))));
}

/**
 * Places matching what has been typed, best first. Never rejects: a failed
 * lookup must not stop anyone creating a plan or seeing their itinerary.
 */
export async function searchCities(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<City[]> {
  const [name, qualifiers] = split(query);
  if (name.length < 2) return [];
  const limit = options.limit ?? 6;

  try {
    const params = new URLSearchParams({
      name,
      // Room to throw away the airports and the other countries' namesakes.
      count: String(Math.min(limit * 3, 30)),
      language: 'en',
      format: 'json',
    });
    const resp = await fetch(`${SEARCH_URL}?${params}`, { signal: options.signal });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { results?: OpenMeteoPlace[] };

    const places = (data.results ?? []).filter(
      (p) => p.name && typeof p.latitude === 'number' && typeof p.longitude === 'number' && isPlace(p.feature_code),
    );
    // A qualifier the traveller typed outranks population: "Lund, Sweden"
    // means that one even if another Lund were larger.
    const ordered = qualifiers.length
      ? [...places.filter((p) => matches(p, qualifiers)), ...places.filter((p) => !matches(p, qualifiers))]
      : places;

    return ordered.slice(0, limit).map((p) => ({
      name: p.name!.trim(),
      region: p.admin1?.trim() || null,
      country: p.country?.trim() || null,
      coordinates: [p.longitude!, p.latitude!],
      label: labelOf(p),
    }));
  } catch {
    return [];
  }
}

/**
 * Where a city is, remembered. A city does not move, so a found one is kept
 * for good; a miss is not kept at all, since the next try may be online.
 */
export async function lookupCity(place: string): Promise<City | null> {
  const key = CACHE_PREFIX + place.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as City;
  } catch {
    // Unreadable: look it up again.
  }

  const [found] = await searchCities(place, { limit: 1 });
  if (!found) return null;
  try {
    localStorage.setItem(key, JSON.stringify(found));
  } catch {
    // Storage full or blocked; it is only a cache.
  }
  return found;
}
