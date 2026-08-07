import type { Activity, Plan } from '../db';

/**
 * A Google Maps URL for an activity.
 *
 * Coordinates win when the activity has been geocoded — they point at the
 * exact spot rather than re-running a name search that may land elsewhere,
 * which is the same ambiguity that put pins on other continents.
 *
 * Falling back to a name, the trip's location is appended for the same reason:
 * "Union Station" alone is in dozens of cities.
 *
 * The `?api=1&query=` form is the documented universal one — it opens the
 * Google Maps app when installed and the web map otherwise, on both
 * platforms, with no per-OS branching.
 */
export function mapsUrlFor(activity: Activity, plan: Pick<Plan, 'destination' | 'country'>): string {
  const base = 'https://www.google.com/maps/search/?api=1&query=';

  if (activity.coordinates) {
    const [lng, lat] = activity.coordinates;
    return `${base}${lat},${lng}`;
  }

  const place = activity.locationName?.trim() || activity.name.trim();
  const context = plan.country
    ? `${plan.destination.split(',')[0].trim()}, ${plan.country}`
    : plan.destination;
  const query = context && !place.toLowerCase().includes(context.split(',')[0].trim().toLowerCase())
    ? `${place}, ${context}`
    : place;

  return `${base}${encodeURIComponent(query)}`;
}
