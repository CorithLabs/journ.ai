import { searchCities } from './cityLookup';

/**
 * Destination lookup for the New Plan form.
 *
 * Open-Meteo's place search is the source — free, keyless, and it returns the
 * COUNTRY alongside the city, which is what makes the visa to-do
 * country-aware instead of asking for a "Toronto visa".
 *
 * A small bundled list is the fallback so plan creation never depends on the
 * network: offline, the user still gets suggestions for common destinations,
 * and can still type a free-form one.
 */

export interface DestinationSuggestion {
  /** What the user sees and what is stored as the plan destination. */
  label: string;
  /** City / place name on its own. */
  city: string;
  /** Country name, or null when it could not be determined. */
  country: string | null;
}

/**
 * Popular destinations, used when the search cannot be reached. Deliberately
 * short — it is a convenience, not a gazetteer; anything missing can still be
 * typed by hand.
 */
const POPULAR: (DestinationSuggestion & { country: string })[] = (
  [
    ['Tokyo', 'Japan'], ['Kyoto', 'Japan'], ['Osaka', 'Japan'],
    ['Paris', 'France'], ['Nice', 'France'], ['London', 'United Kingdom'],
    ['Edinburgh', 'United Kingdom'], ['Rome', 'Italy'], ['Venice', 'Italy'],
    ['Florence', 'Italy'], ['Milan', 'Italy'], ['Barcelona', 'Spain'],
    ['Madrid', 'Spain'], ['Seville', 'Spain'], ['Lisbon', 'Portugal'],
    ['Porto', 'Portugal'], ['Amsterdam', 'Netherlands'], ['Berlin', 'Germany'],
    ['Munich', 'Germany'], ['Vienna', 'Austria'], ['Prague', 'Czechia'],
    ['Budapest', 'Hungary'], ['Zurich', 'Switzerland'], ['Copenhagen', 'Denmark'],
    ['Stockholm', 'Sweden'], ['Oslo', 'Norway'], ['Reykjavik', 'Iceland'],
    ['Dublin', 'Ireland'], ['Athens', 'Greece'], ['Istanbul', 'Turkey'],
    ['Dubai', 'United Arab Emirates'], ['Doha', 'Qatar'],
    ['New York', 'United States'], ['San Francisco', 'United States'],
    ['Los Angeles', 'United States'], ['Chicago', 'United States'],
    ['Seattle', 'United States'], ['Boston', 'United States'],
    ['Miami', 'United States'], ['Las Vegas', 'United States'],
    ['Honolulu', 'United States'], ['New Orleans', 'United States'],
    ['Toronto', 'Canada'], ['Vancouver', 'Canada'], ['Montreal', 'Canada'],
    ['Quebec City', 'Canada'], ['Banff', 'Canada'],
    ['Mexico City', 'Mexico'], ['Cancun', 'Mexico'],
    ['Rio de Janeiro', 'Brazil'], ['Buenos Aires', 'Argentina'],
    ['Lima', 'Peru'], ['Cusco', 'Peru'], ['Santiago', 'Chile'],
    ['Bogota', 'Colombia'], ['Cartagena', 'Colombia'],
    ['Bangkok', 'Thailand'], ['Chiang Mai', 'Thailand'], ['Phuket', 'Thailand'],
    ['Singapore', 'Singapore'], ['Hong Kong', 'Hong Kong'],
    ['Seoul', 'South Korea'], ['Beijing', 'China'], ['Shanghai', 'China'],
    ['Taipei', 'Taiwan'], ['Hanoi', 'Vietnam'], ['Ho Chi Minh City', 'Vietnam'],
    ['Bali', 'Indonesia'], ['Kuala Lumpur', 'Malaysia'],
    ['Delhi', 'India'], ['Mumbai', 'India'], ['Jaipur', 'India'], ['Goa', 'India'],
    ['Kathmandu', 'Nepal'], ['Colombo', 'Sri Lanka'],
    ['Sydney', 'Australia'], ['Melbourne', 'Australia'], ['Brisbane', 'Australia'],
    ['Auckland', 'New Zealand'], ['Queenstown', 'New Zealand'],
    ['Cape Town', 'South Africa'], ['Johannesburg', 'South Africa'],
    ['Marrakesh', 'Morocco'], ['Cairo', 'Egypt'], ['Nairobi', 'Kenya'],
  ] as const
).map(([city, country]) => ({ city, country, label: `${city}, ${country}` }));

/**
 * A destination has to contain letters. Guards the case where "12345" or "!!!"
 * is accepted as a city, which then produces a nonsense itinerary prompt.
 * Deliberately permissive about scripts — any Unicode letter counts, so
 * "東京" and "Zürich" pass.
 */
export function isPlausibleDestination(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  return /\p{L}{2,}/u.test(trimmed);
}

export const DESTINATION_ERROR =
  'Enter a place name, e.g. Tokyo or Toronto.';

/** Match the bundled list on city or country prefix, then substring. */
function searchPopular(query: string): DestinationSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = POPULAR.filter(
    (d) => d.city.toLowerCase().startsWith(q) || d.country.toLowerCase().startsWith(q),
  );
  const contains = POPULAR.filter(
    (d) => !starts.includes(d) && d.label.toLowerCase().includes(q),
  );
  return [...starts, ...contains].slice(0, 6);
}

/**
 * Suggestions for a partial destination. Never rejects — on a network failure
 * or a bad response it silently falls back to the bundled list, because a
 * failed lookup must not block the user from creating a plan.
 */
export async function searchDestinations(
  query: string,
  signal?: AbortSignal,
): Promise<DestinationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const hits = await searchCities(trimmed, { limit: 6, signal });
  // An empty result is a real answer ("no such place"), but showing nothing
  // is unhelpful mid-typing — fall back so the user still gets options.
  return hits.length
    ? hits.map((c) => ({ label: c.label, city: c.name, country: c.country }))
    : searchPopular(trimmed);
}
