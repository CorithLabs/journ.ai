import { type Activity } from '../db';

/**
 * Calculates the straight-line (Haversine) distance in km between two [lng, lat] points.
 */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlng = Math.sin(dLng / 2);
  const h =
    sinDlat * sinDlat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDlng * sinDlng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Calculates the total straight-line route distance in kilometres for an ordered
 * array of [lng, lat] coordinate pairs using the Haversine formula.
 *
 * Returns 0 for arrays with fewer than 2 points.
 */
export function routeDistance(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineKm(coords[i], coords[i + 1]);
  }
  return total;
}

/**
 * Reorders an activities array according to a desired sequence of activity IDs.
 *
 * @param activities - The current array of Activity objects.
 * @param orderedIds - The desired order expressed as an array of activity IDs.
 * @returns A new array of activities in the order specified by `orderedIds`.
 * @throws If `orderedIds` contains an ID not present in `activities`, or if `orderedIds`
 *         contains duplicate IDs.
 */
export function applyReorder(activities: Activity[], orderedIds: string[]): Activity[] {
  // Build a lookup map
  const activityMap = new Map<string, Activity>(
    activities.map((a) => [a.id, a]),
  );

  // Check for duplicate IDs in orderedIds
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) {
      throw new Error(
        `applyReorder: duplicate ID "${id}" in orderedIds — each activity ID must appear exactly once`,
      );
    }
    seen.add(id);
  }

  // Check all IDs exist
  for (const id of orderedIds) {
    if (!activityMap.has(id)) {
      throw new Error(
        `applyReorder: ID "${id}" not found in activities array`,
      );
    }
  }

  return orderedIds.map((id) => activityMap.get(id)!);
}
