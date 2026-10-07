import { type Activity, type Plan, db } from '../db';
import { getDayColor } from '../constants/colors';
import { sortByTime } from '../utils/activityTime';
import { tripRoute, sameCity } from '../utils/travel';
import { photonSearch, type PhotonPlace } from './photon';
import { lookupCity } from './cityLookup';

/**
 * Where an itinerary's places are, without an account anywhere.
 *
 * Activities are found with Photon (OpenStreetMap search) and the trip's
 * cities with Open-Meteo, both free and keyless. This used to be Mapbox with
 * OpenStreetMap as the fallback; OSM was already the better of the two on the
 * beaches, parks and trails people actually go to, and the guards below were
 * already applied to it. What changes is only who is asked first — and that
 * nobody needs a token for their pins to appear.
 */

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
   * Reject a result that is nothing more than a town or district.
   *
   * Set when the query is a guess rather than a stated location — an activity
   * name being tried because no location was given. A search for "Lunch,
   * Tokyo" answers with Tokyo, which passes every distance check and drops a
   * pin in the middle of the city for something that is not a place at all.
   *
   * Not set for a location the traveller actually typed: "Tokyo" as a
   * location means the city, and is a fair answer.
   */
  rejectCityItself?: boolean;
  /**
   * How far from the anchors a result may be, in km. The trip-wide guard by
   * default; much tighter when looking for a named place inside a town that
   * has already been found.
   */
  maxKm?: number;
  /**
   * Only accept a result whose name shares a real word with this one. Used
   * when looking for an activity inside a town, where a loose match is worse
   * than none: "Return to Tokyo" is not a street that happens to be nearby.
   */
  nameLike?: string;
  /** The town being searched inside, whose name does not count toward a match. */
  townName?: string;
}

/** A resolved place: where it is, and what the map data calls it. */
export interface GeocodedPlace {
  coordinates: [number, number];
  /** The full address, e.g. "Ichiran, 1-22-7 Jinnan, Shibuya, Tokyo". */
  address: string;
  /** True when the result is an area — a town, ward or district — not a place in it. */
  area?: boolean;
}

/**
 * Close enough to an anchor to be that anchor. A search that found nothing
 * better often answers with the city's own point.
 */
const CITY_ITSELF_KM = 0.1;

/**
 * Results that are an area rather than a place: the city, its wards, the
 * prefecture. The anchors come from a different service than the results, so
 * their idea of "the middle of Tokyo" need not agree to the metre — asking
 * what the result *is* catches the city answer either way.
 */
const AREA = /^(place:(city|town|village|hamlet|municipality|county|state|province|region|country|district|borough|suburb|quarter|neighbourhood)|boundary:)/;

function isAreaOnly(hit: PhotonPlace): boolean {
  return AREA.test(hit.kind);
}

/** The words of a name worth matching on: "Nikko Tosho-gu Shrine" → nikko, tosho, shrine. */
function words(name: string): Set<string> {
  return new Set(
    name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
  );
}

/**
 * Words that say what someone is doing, not where. "Return to Tokyo" is not
 * the "Return of Ultraman" artwork for sharing one of them.
 */
const GENERIC = new Set([
  'return', 'visit', 'tour', 'trip', 'walk', 'lunch', 'dinner', 'breakfast', 'brunch', 'drinks',
  'check', 'back', 'head', 'explore', 'free', 'time', 'morning', 'afternoon', 'evening', 'night',
  'from', 'into', 'with', 'around', 'near', 'train', 'transfer', 'arrive', 'arrival', 'depart', 'departure',
]);

/**
 * Whether a result's name is plausibly the activity: at least half of the
 * activity's own distinctive words appear in it. The town's name does not
 * count — "Nikko Tosho-gu Shrine" inside Nikko is matched on Tosho-gu.
 */
function namesMatch(activity: string, result: string, town?: string): boolean {
  const skip = town ? words(town) : new Set<string>();
  const wanted = [...words(activity)].filter((w) => !GENERIC.has(w) && !skip.has(w));
  if (!wanted.length) return false;
  const got = words(result);
  const hits = wanted.filter((w) => got.has(w)).length;
  return hits > 0 && hits * 2 >= wanted.length;
}

/** The first result that passes the guards. */
function firstAcceptable(
  hits: PhotonPlace[],
  anchors: Array<[number, number]>,
  options: GeocodeOptions,
): GeocodedPlace | null {
  /*
   * Inside a town, the nearest match wins rather than the first: the search's
   * own ranking put a small "Meiji Shrine" 24km away in Chiba above the
   * shrine's grounds 1.5km from Shibuya.
   */
  const ordered = options.nameLike && anchors.length
    ? [...hits].sort((a, b) => haversineKm(anchors[0], a.coordinates) - haversineKm(anchors[0], b.coordinates))
    : hits;
  for (const hit of ordered) {
    // Proximity only ranks; it does not filter. A name with no local match
    // still returns the far-away one, which is what put pins on other
    // continents even with a bias applied.
    const limit = options.maxKm ?? MAX_ACTIVITY_DISTANCE_KM;
    if (anchors.length && !anchors.some((a) => haversineKm(a, hit.coordinates) <= limit)) {
      continue;
    }
    if (options.nameLike && !namesMatch(options.nameLike, hit.name, options.townName)) continue;
    if (
      options.rejectCityItself &&
      (isAreaOnly(hit) || anchors.some((a) => haversineKm(a, hit.coordinates) <= CITY_ITSELF_KM))
    ) {
      continue;
    }
    return { coordinates: hit.coordinates, address: hit.address, area: isAreaOnly(hit) };
  }
  return null;
}

/**
 * Find a place by name, near the trip.
 *
 * Place names are not unique: Union Station, Chinatown, Little Italy and
 * Victoria Park all exist in dozens of countries. Callers pass the trip's
 * location as `proximity` and `context` so results resolve near the trip, and
 * every candidate is held to the distance guard.
 */
export async function geocodePlace(
  locationName: string,
  options: GeocodeOptions = {},
): Promise<GeocodedPlace | null> {
  const name = locationName.trim();
  if (!name) return null;

  const anchors = options.anchors?.length
    ? options.anchors
    : options.proximity
      ? [options.proximity]
      : [];

  // Only add context the name doesn't already carry, so we don't send
  // "Tsukiji, Tokyo, Tokyo, Japan".
  const ctx = options.context?.trim();
  const withContext =
    ctx && !name.toLowerCase().includes(ctx.split(',')[0].trim().toLowerCase())
      ? `${name}, ${ctx}`
      : name;

  // Several candidates, not one: the right Union Station can be second.
  const first = firstAcceptable(
    await photonSearch(withContext, { proximity: options.proximity, limit: 5 }),
    anchors,
    options,
  );
  if (first || withContext === name) return first;

  /*
   * The city appended can be what stops a match — OSM names the temple
   * "Sensō-ji", and "Senso-ji Temple, Tokyo, Japan" asks for more words than
   * it has. Asked once more by name alone; the proximity bias and the
   * distance guard still keep it near the trip.
   */
  return firstAcceptable(
    await photonSearch(name, { proximity: options.proximity, limit: 5 }),
    anchors,
    options,
  );
}

/** The same lookup, for callers that only want the point. */
export async function geocodeLocation(
  locationName: string,
  options: GeocodeOptions = {},
): Promise<[number, number] | null> {
  return (await geocodePlace(locationName, options))?.coordinates ?? null;
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

  // A round trip names its start twice; it only needs looking up once.
  const out: Array<{ city: string; context: string }> = [];
  for (const city of tripRoute(plan)) {
    const entry = withCountry(city);
    if (!out.some((o) => sameCity(o.city, entry.city))) out.push(entry);
  }
  return out;
}

/** "Nikkō" and "Nikko" are the same town. */
function bare(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/** How far a named place may sit from the town its location names, in km. */
const WITHIN_TOWN_KM = 25;

/**
 * Where one activity is.
 *
 * A location is often only a town or a district — "Nikko, Japan", "Shibuya,
 * Tokyo" — and searching for that text near the trip finds the wrong thing:
 * a hotel called Nikko in central Tokyo, or the middle of Shibuya for every
 * stop that happens to be there, so Meiji Shrine and the Crossing share a pin.
 *
 * So the town is found first, as a town (Open-Meteo is a gazetteer and good at
 * exactly this), and then the activity's own name is looked for inside it —
 * Tosho-gu near Nikko, Meiji Shrine near Shibuya. When the name finds nothing
 * there, the town is still the honest answer: that is where the traveller said
 * it was.
 */
async function locateActivity(
  act: Activity,
  owner: { coords: [number, number]; context: string } | undefined,
  allAnchors: Array<[number, number]>,
): Promise<GeocodedPlace | null> {
  const stated = act.locationName.trim();
  const name = act.name.trim();

  // Nothing stated: the name is a guess, held to the stricter standard.
  if (!stated) {
    return geocodePlace(name, {
      rejectCityItself: true,
      proximity: owner?.coords,
      anchors: allAnchors,
      context: owner?.context,
    });
  }

  const withinTown = async (area: [number, number], townName: string) =>
    name && bare(name) !== bare(stated)
      ? geocodePlace(name, {
          rejectCityItself: true, proximity: area, anchors: [area], maxKm: WITHIN_TOWN_KM, nameLike: name, townName,
        })
      : null;

  /*
   * The town has to be the one meant. "Harajuku, Tokyo" is not the Harajuku
   * in Saitama: whatever follows the comma must be part of where the town is,
   * or the city of the trip it sits beside.
   */
  const [head, ...qualifiers] = stated.split(',').map((p) => p.trim()).filter(Boolean);
  const town = await lookupCity(stated);
  const nearTrip = (at: [number, number]) =>
    !allAnchors.length || allAnchors.some((a) => haversineKm(a, at) <= MAX_ACTIVITY_DISTANCE_KM);
  const qualified = (t: NonNullable<typeof town>) =>
    qualifiers.every((q) =>
      bare(t.label).includes(bare(q)) ||
      (owner && bare(owner.context).startsWith(bare(q)) && haversineKm(owner.coords, t.coordinates) <= WITHIN_TOWN_KM));
  if (town && bare(town.name) === bare(head) && qualified(town) && nearTrip(town.coordinates)) {
    return (await withinTown(town.coordinates, town.name)) ?? { coordinates: town.coordinates, address: town.label, area: true };
  }

  const place = await geocodePlace(stated, {
    proximity: owner?.coords,
    anchors: allAnchors,
    context: owner?.context,
  });
  if (place?.area) return (await withinTown(place.coordinates, head)) ?? place;
  return place;
}

/**
 * Find every activity in a plan that has a name or location but no
 * coordinates, and save what was found. Returns the IDs that could not be
 * placed.
 */
export async function geocodePlanActivities(
  plan: Plan,
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
  const anchored: Array<{ city: string; context: string; coords: [number, number] }> = [];
  for (const { city, context } of tripCityContexts(plan)) {
    const found = await lookupCity(context);
    if (found) anchored.push({ city, context, coords: found.coordinates });
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
       * Most of what goes missing from the map is not a lookup failure — it is
       * a card that was never looked up at all, because the location field was
       * left empty. "Senso-ji Temple" is a perfectly good query on its own,
       * and hand-added cards almost never carry a separate location.
       */
      if (!act.locationName.trim() && !act.name.trim()) continue;

      // Bias toward the city the activity names, so "Todai-ji, Nara" resolves
      // near Nara rather than wherever the trip happens to start.
      const haystack = `${act.locationName} ${act.name}`.toLowerCase();
      const owner =
        anchored.find((a) => haystack.includes(a.city.toLowerCase())) ?? primary;

      const place = await locateActivity(act, owner, allAnchors);
      if (place) {
        day.activities[i] = {
          ...act,
          coordinates: place.coordinates,
          address: place.address,
          locationUnresolved: false,
        };
        changed = true;
      } else {
        failed.add(act.id);
        onFail?.(act.name);
        // Recorded, so the card can say it was looked for and not found —
        // which no absence of coordinates can distinguish from not yet tried.
        if (!act.locationUnresolved) {
          day.activities[i] = { ...act, locationUnresolved: true };
          changed = true;
        }
      }
    }
  }

  if (changed) {
    await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
  }

  return failed;
}

/** An activity that has a place on the map, numbered as the day reads. */
export interface PinActivity {
  activity: Activity;
  dayIndex: number;
  dayLabel: string;
  sequenceNumber: number; // 1-based, per day
  dayColor: string;
}

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

/** Haversine distance in km between two [lng, lat] points. */
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

/** Total distance (km) along an ordered list of points. */
export function totalRouteDistanceKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1], coords[i]);
  }
  return total;
}
