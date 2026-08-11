import type { Plan, Day } from '../db';
import { tripRoute, sameCity } from './travel';
import { tripDayCount } from './tripDuration';

/**
 * Which city each day of the trip is spent in.
 *
 * Weather is a city, not a coordinate. Forecasting the trip's destination and
 * showing it on every day is wrong the moment the trip has more than one city:
 * a Tokyo forecast tells you nothing about the day you are in Osaka, 400km
 * away. And a rainy Tokyo day cannot be swapped with a clear Osaka one — they
 * are different places, so the activities cannot trade.
 *
 * Two sources, most specific first:
 *
 *   1. What the day says it is doing. An activity in "Osaka Castle, Osaka"
 *      places that day in Osaka, and this improves on its own as an itinerary
 *      gets more specific.
 *   2. Failing that, the route and its nights. A trip that lists Kyoto for two
 *      nights and Nara for one gets those days in that order.
 *
 * No AI involved: both are things the plan already knows.
 */
export function cityForDay(plan: Plan, day: Pick<Day, 'dayIndex' | 'activities'>): string {
  const route = tripRoute(plan);
  if (route.length <= 1) return plan.destination;

  const named = cityFromActivities(day, route);
  if (named) return named;

  return cityFromNights(plan, route, day.dayIndex);
}

/** The first trip city an activity on this day actually names. */
function cityFromActivities(day: Pick<Day, 'activities'>, route: string[]): string | null {
  for (const activity of day.activities) {
    const text = `${activity.locationName ?? ''} ${activity.name}`.toLowerCase();
    for (const city of route) {
      const bare = city.split(',')[0].trim().toLowerCase();
      if (bare && text.includes(bare)) return city;
    }
  }
  return null;
}

/**
 * Walk the route, spending the nights each city was given.
 *
 * Cities with no night count share what is left over, so a route with no
 * numbers at all still divides evenly rather than putting everything in the
 * first city.
 */
function cityFromNights(plan: Plan, route: string[], dayIndex: number): string {
  const total = tripDayCount(plan.startDate, plan.endDate) ?? route.length;
  const stated = new Map<string, number>();
  for (const stop of plan.stops ?? []) {
    if (stop.city?.trim() && stop.nights) stated.set(stop.city.split(',')[0].trim().toLowerCase(), stop.nights);
  }

  const known = route.filter((c) => stated.has(c.split(',')[0].trim().toLowerCase()));
  const spoken = known.reduce((n, c) => n + (stated.get(c.split(',')[0].trim().toLowerCase()) ?? 0), 0);
  const unknownCities = route.length - known.length;
  const leftover = Math.max(0, total - spoken);
  const share = unknownCities > 0 ? Math.max(1, Math.round(leftover / unknownCities)) : 0;

  let cursor = 0;
  for (const city of route) {
    const nights = stated.get(city.split(',')[0].trim().toLowerCase()) ?? share;
    cursor += Math.max(1, nights);
    if (dayIndex < cursor) return city;
  }
  // Past the end of everything the route accounts for: the last city is where
  // the trip finishes.
  return route[route.length - 1];
}

/**
 * The days that could take another day's activities.
 *
 * Only days in the same city: a rainy Tokyo day and a clear Osaka one are
 * different places, so their activities cannot trade however good the Osaka
 * weather is. This is decided here rather than asked of the AI, because it is
 * a fact about the trip and not a matter of judgement.
 */
export function swappableDays(plan: Plan, dayIndex: number): Day[] {
  const target = plan.itinerary.find((d) => d.dayIndex === dayIndex);
  if (!target) return [];
  const city = cityForDay(plan, target);
  return plan.itinerary.filter(
    (d) => d.dayIndex !== dayIndex && sameCity(cityForDay(plan, d), city),
  );
}
