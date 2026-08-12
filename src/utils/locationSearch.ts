import type { Activity, Plan } from '../db';

/**
 * A point to search venues around, taken from the activities already placed.
 *
 * The day's other cards are the best anchor available without another lookup:
 * they are in the city this activity belongs to, which on a multi-city trip
 * the destination is not. Searching for "Ichiran" on the Osaka day should not
 * be biased toward Tokyo because Tokyo is where the trip started.
 */
export function nearbyAnchor(
  siblings: Pick<Activity, 'id' | 'coordinates'>[],
  exceptId?: string,
): [number, number] | undefined {
  return siblings.find((a) => a.id !== exceptId && a.coordinates)?.coordinates;
}

/**
 * The city text appended to a venue query, e.g. "Tokyo, Japan".
 *
 * Proximity only ranks results; it does not exclude anything. A query with no
 * local match still returns the far-away one, so the city has to be in the
 * query itself and not merely alongside it.
 */
export function locationContext(
  plan: Pick<Plan, 'destination' | 'country'> | undefined,
): string | undefined {
  const city = plan?.destination?.trim();
  if (!city) return undefined;
  const country = plan?.country?.trim();
  // A destination typed with its own qualifier has already said where it is.
  if (!country || city.includes(country) || city.includes(',')) return city;
  return `${city}, ${country}`;
}
