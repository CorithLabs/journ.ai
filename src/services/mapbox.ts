import { type Activity, type Plan, db } from '../db';

/** localStorage key for the Mapbox access token */
export const MAPBOX_TOKEN_KEY = 'aitp_mapbox_token';

export function getMapboxToken(): string | null {
  return localStorage.getItem(MAPBOX_TOKEN_KEY);
}

/**
 * Geocode a location name to [lng, lat] coordinates using Mapbox Geocoding API.
 * Returns null if token missing, location empty, or request fails.
 */
export async function geocodeLocation(
  locationName: string,
  token: string,
): Promise<[number, number] | null> {
  if (!locationName.trim() || !token) return null;
  try {
    const encoded = encodeURIComponent(locationName);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=1`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      features?: { center?: [number, number] }[];
    };
    const center = data.features?.[0]?.center;
    if (!center || center.length < 2) return null;
    return [center[0], center[1]];
  } catch {
    return null;
  }
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
  let itinerary = plan.itinerary.map(d => ({ ...d, activities: [...d.activities] }));
  let changed = false;

  for (const day of itinerary) {
    for (let i = 0; i < day.activities.length; i++) {
      const act = day.activities[i];
      if (act.coordinates || !act.locationName.trim()) continue;

      const coords = await geocodeLocation(act.locationName, token);
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
    for (const activity of day.activities) {
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
