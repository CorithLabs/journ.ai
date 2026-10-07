import type { Day, Plan } from '../db';
import { cityForDay } from './dayCity';
import { sameCity, tripRoute } from './travel';

/**
 * Where a day is actually spent, for the photo at the top of its card.
 *
 * On a multi-city trip that is the route's city for the day. On a single-city
 * trip it can still be somewhere else: a day out to Nikko from Tokyo never
 * appears in the route, but its activities say where it goes.
 */
export function dayPlace(plan: Plan, day: Pick<Day, 'dayIndex' | 'activities'>): string {
  if (tripRoute(plan).length > 1) return cityForDay(plan, day);
  return dayTripTown(plan, day) ?? plan.destination;
}

/**
 * The town a day trip goes to, read from the day's locations.
 *
 * Deliberately cautious. Half the day's places have to be somewhere that is
 * not the destination, and two of them have to name the same town: a single
 * stop outside the city is an errand, not a day out. Places written as a
 * neighbourhood of the destination ("Asakusa, Tokyo") count as home.
 */
export function dayTripTown(
  plan: Pick<Plan, 'destination'>,
  day: Pick<Day, 'activities'>,
): string | null {
  const home = plan.destination.split(',')[0].trim().toLowerCase();
  if (!home) return null;

  const places = day.activities.map((a) => a.locationName?.trim() ?? '').filter(Boolean);
  if (places.length < 2) return null;

  const away = places.filter((p) => !p.toLowerCase().includes(home));
  if (away.length * 2 < places.length) return null;

  const towns = new Map<string, { place: string; n: number }>();
  for (const place of away) {
    const key = place.split(',')[0].trim().toLowerCase();
    if (!key) continue;
    const seen = towns.get(key);
    towns.set(key, { place: seen?.place ?? place, n: (seen?.n ?? 0) + 1 });
  }
  const best = [...towns.values()].sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < 2 || sameCity(best.place, plan.destination)) return null;
  return best.place;
}
