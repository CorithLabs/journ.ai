import type { Plan, TravelMode, TripLeg } from '../db';

/**
 * Travel that is not necessarily a flight.
 *
 * The app used to assume one: every trip produced "Book flights to X" and an
 * entry-requirement to-do, which is wrong for a road trip two towns over and
 * wrong again for anyone driving across a border they cross every week.
 */
export const TRAVEL_MODES = [
  { id: 'flight', label: 'Flight', booking: 'Book flights' },
  { id: 'train', label: 'Train', booking: 'Book train tickets' },
  { id: 'bus', label: 'Bus', booking: 'Book bus tickets' },
  // Nothing to book. Inventing a task so the list looks complete is how the
  // to-dos stopped being trustworthy in the first place.
  { id: 'car', label: 'Car', booking: null },
  { id: 'ferry', label: 'Ferry', booking: 'Book ferry tickets' },
  { id: 'other', label: 'Other', booking: 'Book travel' },
] as const satisfies ReadonlyArray<{ id: TravelMode; label: string; booking: string | null }>;

export function travelModeLabel(mode: TravelMode | undefined): string {
  return TRAVEL_MODES.find((m) => m.id === mode)?.label ?? 'Travel';
}

/**
 * What there is to book, as a noun — "train tickets", "flights".
 *
 * Null for a road trip, which is the point: the question "have you booked
 * your flights?" has no answer when there are none.
 */
export function travelNoun(mode: TravelMode | undefined): string | null {
  const found = TRAVEL_MODES.find((m) => m.id === mode);
  if (found && found.booking === null) return null;
  return found ? found.booking.replace(/^Book /, '') : 'travel';
}

/** The booking task for a mode, or null when there is nothing to book. */
export function travelBookingTitle(mode: TravelMode | undefined, place: string): string | null {
  const found = TRAVEL_MODES.find((m) => m.id === mode);
  // An unset mode is not the same as "car" — the trip may well need tickets —
  // but it is not a flight either. "Book travel" is what can honestly be said
  // when nobody has said, and is what every plan predating this gets.
  const prefix = found ? found.booking : 'Book travel';
  return prefix ? `${prefix} to ${place}` : null;
}

/**
 * Every country the trip touches, in visit order and without repeats.
 *
 * Entry rules are per country, so a trip through three of them needs three
 * checks — one for the destination is only right for the single-country case.
 */
export function tripCountries(plan: Pick<Plan, 'country' | 'stops' | 'arrival'>): string[] {
  const all = [
    plan.arrival?.country,
    plan.country,
    ...(plan.stops ?? []).map((s) => s.country),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of all) {
    const name = c?.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Two city names are the same place if their first part matches. */
export function sameCity(a: string, b: string): boolean {
  const bare = (c: string) => c.split(',')[0].trim().toLowerCase();
  return bare(a) === bare(b) && bare(a) !== '';
}

/**
 * The cities of the trip, in the order they are actually visited.
 *
 * The destination is where a trip is *about*, which is not always where it
 * begins. Flying to Tokyo, Tokyo is the first city. Driving from Montreal to
 * Percé and back, Percé is the far end — and listing it first produced a route
 * that started and ended there, with the outbound leg driven in reverse.
 *
 * So: entering the trip somewhere other than the destination makes the
 * destination the far point. And a destination the user has already listed as
 * a stop is not added twice, which is what put Percé at both ends.
 */
export function tripRoute(
  plan: Pick<Plan, 'destination' | 'stops' | 'arrival' | 'departure'>,
): string[] {
  const stops = (plan.stops ?? []).map((s) => s.city?.trim()).filter((c): c is string => !!c);
  const dest = plan.destination?.trim() ?? '';
  const start = plan.arrival?.city?.trim();
  const end = plan.departure?.city?.trim();

  const middle = stops.some((c) => sameCity(c, dest))
    ? stops
    : start && !sameCity(start, dest)
      ? [...stops, dest]
      : [dest, ...stops];

  const route = [...(start ? [start] : []), ...middle, ...(end ? [end] : [])]
    .filter(Boolean);

  // Only consecutive repeats collapse. Starting and ending in Montreal is a
  // round trip, not a duplicate.
  return route.filter((c, i) => i === 0 || !sameCity(c, route[i - 1]));
}

/** Every city the trip visits, in order — the destination first. */
export function tripCities(plan: Pick<Plan, 'destination' | 'stops'>): string[] {
  return [plan.destination, ...(plan.stops ?? []).map((s) => s.city)].filter((c) => c?.trim());
}

/** "Flight into Osaka, 22:40 on 2025-07-14" — or null when nothing is known. */
export function describeLeg(leg: TripLeg | undefined, fallbackCity: string): string | null {
  if (!leg) return null;
  const parts: string[] = [];
  if (leg.mode) parts.push(travelModeLabel(leg.mode));
  const city = leg.city?.trim() || fallbackCity;
  if (city) parts.push(city);
  const when = [leg.date, leg.time].filter(Boolean).join(' ');
  if (when) parts.push(when);
  return parts.length ? parts.join(' · ') : null;
}
