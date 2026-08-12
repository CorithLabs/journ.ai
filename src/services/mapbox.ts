import { type Activity, type Plan, db } from '../db';
import { sortByTime } from '../utils/activityTime';
import { tripRoute, sameCity } from '../utils/travel';

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
  /**
   * Reject a result that is nothing more than the city itself.
   *
   * Set when the query is a guess rather than a stated location — an activity
   * name being tried because no location was given. Mapbox answers "Lunch,
   * Tokyo, Japan" with Tokyo, which passes every distance check and drops a
   * pin in the middle of the city for something that is not a place at all.
   *
   * Not set for a location the traveller actually typed: "Tokyo" as a
   * location means the city, and is a fair answer.
   */
  rejectCityItself?: boolean;
}

/**
 * Close enough to an anchor to be that anchor.
 *
 * A geocoder that finds nothing returns the city feature's own centre, so a
 * result landing on the point we looked the city up at is the geocoder saying
 * "no" in the shape of a yes. Real places sit further out — 100m is inside a
 * single city block.
 */
const CITY_ITSELF_KM = 0.1;

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
    if (
      options.rejectCityItself &&
      anchors.some((a) => haversineKm(a, coords) <= CITY_ITSELF_KM)
    ) {
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
 * Built from the route rather than the destination and stops alone, so the
 * city the traveller starts and ends in is included. On a Montreal → Percé
 * road trip Montreal was in no list at all: a Montreal activity sat ~900km
 * from every anchor, failed the distance guard meant to stop pins landing on
 * other continents, and never reached the map.
 *
 * The country matters too: "Nara" alone matches places in three of them,
 * while "Nara, Japan" does not. A city that names no country of its own
 * borrows the trip's, which is right far more often than it is wrong.
 */
export function tripCityContexts(
  plan: Pick<Plan, 'destination' | 'country' | 'stops' | 'arrival' | 'departure'>,
): Array<{ city: string; context: string }> {
  // Where each city's own country was given, if anywhere.
  const declared = new Map<string, string>();
  for (const entry of [
    { city: plan.destination, country: plan.country },
    ...(plan.stops ?? []),
    ...(plan.arrival ? [{ city: plan.arrival.city, country: plan.arrival.country }] : []),
    ...(plan.departure ? [{ city: plan.departure.city, country: plan.departure.country }] : []),
  ]) {
    const city = entry.city?.trim();
    const country = entry.country?.trim();
    if (city && country && !declared.has(city.split(',')[0].trim().toLowerCase())) {
      declared.set(city.split(',')[0].trim().toLowerCase(), country);
    }
  }

  const withCountry = (raw: string) => {
    const city = raw.trim();
    const bare = city.split(',')[0].trim();
    const own = declared.get(bare.toLowerCase());
    if (own) return { city: bare, context: city.includes(own) ? city : `${bare}, ${own}` };

    /*
     * A city typed with its own qualifier has already said where it is.
     * Stripping it and appending the trip's country turned "Lund, Sweden"
     * into "Lund, Denmark" on a Copenhagen plan — a cross-border day trip
     * pinned in the wrong country.
     */
    if (city.includes(',')) return { city: bare, context: city };

    const land = plan.country?.trim();
    return { city: bare, context: land ? `${bare}, ${land}` : city };
  };

  // A round trip names its start twice; it only needs geocoding once.
  const out: Array<{ city: string; context: string }> = [];
  for (const city of tripRoute(plan)) {
    const entry = withCountry(city);
    if (!out.some((o) => sameCity(o.city, entry.city))) out.push(entry);
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
      if (act.coordinates) continue;

      /*
       * An activity with no location falls back to its own name.
       *
       * Most of what goes missing from the map is not a geocoding failure —
       * it is a card that was never looked up at all, because the location
       * field was left empty. "Senso-ji Temple" is a perfectly good query on
       * its own, and hand-added cards almost never carry a separate location.
       *
       * Named guesses are held to a stricter standard (rejectCityItself), or
       * "Lunch" would pin the middle of Tokyo.
       */
      const stated = act.locationName.trim();
      const query = stated || act.name.trim();
      if (!query) continue;

      // Bias toward the city the activity names, so "Todai-ji, Nara" resolves
      // near Nara rather than wherever the trip happens to start.
      const haystack = `${act.locationName} ${act.name}`.toLowerCase();
      const owner =
        anchored.find((a) => haystack.includes(a.city.toLowerCase())) ?? primary;

      const coords = await geocodeLocation(query, token, {
        rejectCityItself: !stated,
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
    // The same order the itinerary renders in, so pin 3 is card 3. Walking the
    // raw array numbered them by however the day happened to be stored.
    //
    // Numbered by position in the day rather than among the pins, so a card
    // that could not be placed leaves a gap — 1, 2, 4 says card 3 is missing,
    // where renumbering hid the fact that anything was missing at all.
    sortByTime(day.activities).forEach((activity, i) => {
      if (activity.coordinates) {
        pins.push({
          activity,
          dayIndex: day.dayIndex,
          dayLabel: day.label,
          sequenceNumber: i + 1,
          dayColor: getDayColor(day.dayIndex),
        });
      }
    });
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
