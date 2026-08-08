import { type Activity, type Plan, db } from '../db';
import { sortByTime } from '../utils/activityTime';

/** localStorage key for the Mapbox access token */
export const MAPBOX_TOKEN_KEY = 'aitp_mapbox_token';

export function getMapboxToken(): string | null {
  return localStorage.getItem(MAPBOX_TOKEN_KEY);
}

/**
 * How far from the trip's destination an activity may plausibly sit.
 *
 * Generous enough for a real day trip — Toronto to Niagara is ~130km, Tokyo to
 * Nikko ~140km — but far short of another continent. Anything beyond this is
 * the geocoder having matched a same-named place elsewhere in the world.
 */
export const MAX_ACTIVITY_DISTANCE_KM = 300;

export interface GeocodeOptions {
  /** Bias results toward this point — the city this activity belongs to. */
  proximity?: [number, number];
  /**
   * Every city the trip visits. A result is kept if it is near ANY of them,
   * because on a multi-city trip a Nara temple is 40km from Kyoto and 500km
   * from Tokyo — measuring only from the primary destination threw away the
   * correct answer.
   *
   * Defaults to `proximity` alone when not given.
   */
  anchors?: Array<[number, number]>;
  /**
   * Appended to the query when the name doesn't already contain it, e.g.
   * "Union Station" → "Union Station, Toronto, Canada".
   */
  context?: string;
}

/**
 * Geocode a location name to [lng, lat] coordinates using Mapbox Geocoding API.
 * Returns null if token missing, location empty, or request fails.
 *
 * Place names are not unique: Union Station, Chinatown, Little Italy and
 * Victoria Park all exist in dozens of countries. An unbiased query returns
 * whichever Mapbox ranks highest globally, which is how a Toronto itinerary
 * ended up with pins in the US and Europe. Callers should pass the trip's
 * location as `proximity` and `context` so results resolve near the trip.
 */
export async function geocodeLocation(
  locationName: string,
  token: string,
  options: GeocodeOptions = {},
): Promise<[number, number] | null> {
  if (!locationName.trim() || !token) return null;
  try {
    // Only add context the name doesn't already carry, so we don't send
    // "Tsukiji, Tokyo, Tokyo, Japan".
    const name = locationName.trim();
    const ctx = options.context?.trim();
    const query =
      ctx && !name.toLowerCase().includes(ctx.split(',')[0].trim().toLowerCase())
        ? `${name}, ${ctx}`
        : name;

    const params = new URLSearchParams({ access_token: token, limit: '1' });
    if (options.proximity) {
      params.set('proximity', `${options.proximity[0]},${options.proximity[1]}`);
    }
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      features?: { center?: [number, number] }[];
    };
    const center = data.features?.[0]?.center;
    if (!center || center.length < 2) return null;
    const coords: [number, number] = [center[0], center[1]];

    // Proximity is only a ranking hint, not a filter — a name with no local
    // match still returns the far-away one. Reject those outright rather than
    // dropping a pin on the wrong continent.
    const anchors = options.anchors?.length
      ? options.anchors
      : options.proximity
        ? [options.proximity]
        : [];
    if (anchors.length && !anchors.some((a) => haversineKm(a, coords) <= MAX_ACTIVITY_DISTANCE_KM)) {
      return null;
    }
    return coords;
  } catch {
    return null;
  }
}

/**
 * Each city of the trip, paired with the fullest name we can build for it.
 *
 * The country matters: "Nara" alone matches places in three countries, while
 * "Nara, Japan" does not. A stop with no country of its own borrows the
 * trip's, which is right far more often than it is wrong — a stop is usually
 * in the same country as the destination.
 */
export function tripCityContexts(
  plan: Pick<Plan, 'destination' | 'country' | 'stops'>,
): Array<{ city: string; context: string }> {
  const withCountry = (city: string, country?: string) => {
    const raw = city.trim();
    const bare = raw.split(',')[0].trim();
    const own = country?.trim();
    if (own) return { city: bare, context: raw.includes(own) ? raw : `${bare}, ${own}` };

    /*
     * A city typed with its own qualifier has already said where it is.
     * Stripping it and appending the trip's country turned "Lund, Sweden"
     * into "Lund, Denmark" on a Copenhagen plan — a cross-border day trip
     * pinned in the wrong country.
     */
    if (raw.includes(',')) return { city: bare, context: raw };

    const land = plan.country?.trim();
    return { city: bare, context: land ? `${bare}, ${land}` : raw };
  };

  const out = [withCountry(plan.destination, plan.country)];
  for (const stop of plan.stops ?? []) {
    if (stop.city?.trim()) out.push(withCountry(stop.city, stop.country));
  }
  return out;
}

/**
 * Geocode all activities in a plan that have a locationName but no coordinates.
 * Updates the plan in IndexedDB with resolved coordinates.
 * Returns a Set of activity IDs that failed to geocode.
 */
export async function geocodePlanActivities(
  plan: Plan,
  token: string,
  onFail?: (activityName: string) => void,
): Promise<Set<string>> {
  const failed = new Set<string>();
  const itinerary = plan.itinerary.map(d => ({ ...d, activities: [...d.activities] }));
  let changed = false;

  /*
   * Resolve every city the trip visits, not just the destination.
   *
   * The trip's own location is unambiguous in a way an activity name is not —
   * it carries its country, either from the picked suggestion or because the
   * user typed "Toronto, Canada". On a multi-city trip each further city needs
   * the same treatment, or a Nara temple is judged by its distance from Tokyo
   * and thrown away.
   */
  const cityNames = tripCityContexts(plan);
  const anchored: Array<{ city: string; context: string; coords: [number, number] }> = [];
  for (const { city, context } of cityNames) {
    const coords = await geocodeLocation(context, token);
    if (coords) anchored.push({ city, context, coords });
  }

  const allAnchors = anchored.map((a) => a.coords);
  const primary = anchored[0];

  for (const day of itinerary) {
    for (let i = 0; i < day.activities.length; i++) {
      const act = day.activities[i];
      if (act.coordinates || !act.locationName.trim()) continue;

      // Bias toward the city the activity names, so "Todai-ji, Nara" resolves
      // near Nara rather than wherever the trip happens to start.
      const haystack = `${act.locationName} ${act.name}`.toLowerCase();
      const owner =
        anchored.find((a) => haystack.includes(a.city.toLowerCase())) ?? primary;

      const coords = await geocodeLocation(act.locationName, token, {
        proximity: owner?.coords,
        anchors: allAnchors,
        context: owner?.context,
      });
      if (coords) {
        day.activities[i] = { ...act, coordinates: coords };
        changed = true;
      } else {
        failed.add(act.id);
        onFail?.(act.name);
      }
    }
  }

  if (changed) {
    await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
  }

  return failed;
}

/**
 * Get all activities with resolved coordinates from the plan.
 * Returns an array of { activity, dayIndex, dayLabel, sequenceNumber }
 */
export interface PinActivity {
  activity: Activity;
  dayIndex: number;
  dayLabel: string;
  sequenceNumber: number; // 1-based, per day
  dayColor: string;
}

import { getDayColor } from '../constants/colors';

export function getPinActivities(plan: Plan): PinActivity[] {
  const pins: PinActivity[] = [];
  for (const day of plan.itinerary) {
    let seq = 1;
    // The same order the itinerary renders in, so pin 3 is card 3. Walking the
    // raw array numbered them by however the day happened to be stored.
    for (const activity of sortByTime(day.activities)) {
      if (activity.coordinates) {
        pins.push({
          activity,
          dayIndex: day.dayIndex,
          dayLabel: day.label,
          sequenceNumber: seq,
          dayColor: getDayColor(day.dayIndex),
        });
        seq++;
      }
    }
  }
  return pins;
}

/**
 * Compute haversine distance in km between two [lng, lat] coordinates.
 */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

/**
 * Compute total route distance (km) for an ordered list of coordinates.
 */
export function totalRouteDistanceKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1], coords[i]);
  }
  return total;
}
