import type { TripLeg } from '../db';
import { airportForCity, airportLabel } from '../data/airports';

/**
 * What an international trip almost certainly looks like, filled in for you.
 *
 * Saying a trip crosses a border answers most of the travel section by
 * implication: you are flying, you are flying into the destination's main
 * airport, you land on the first day and leave on the last, and you come home
 * from where you arrived. Every one of those was a field the traveller had to
 * open a collapsed section to fill in by hand.
 *
 * They are defaults, not decisions. An international trip is not always a
 * flight — Copenhagen to Lund is a train across a border — so everything here
 * stays editable, and the section is opened rather than filled in silently.
 * Nothing already answered is overwritten.
 */
export function internationalFlightDefaults({
  destination,
  country,
  startDate,
  endDate,
  arrival,
  departure,
}: {
  destination: string;
  country?: string | null;
  startDate?: string;
  endDate?: string;
  arrival: TripLeg;
  departure: TripLeg;
}): { arrival: TripLeg; departure: TripLeg } {
  const airport = airportForCity(destination);

  /*
   * The airport's own city, which is not always the destination: Kyoto's
   * airport is in Osaka and Banff's is in Calgary. Falling back to the
   * destination keeps the leg useful for a city we have no airport for.
   */
  const landsIn = airport?.city ?? destination.split(',')[0].trim();

  const filled = (leg: TripLeg, date?: string): TripLeg => ({
    ...leg,
    mode: leg.mode ?? 'flight',
    city: leg.city?.trim() ? leg.city : landsIn,
    country: leg.country ?? country ?? undefined,
    // Only when we know one. A blank field invites the traveller to name
    // theirs; a wrong guess has to be spotted before it can be corrected.
    airport: leg.airport?.trim() ? leg.airport : airport ? airportLabel(airport) : undefined,
    date: leg.date?.trim() ? leg.date : date,
  });

  return {
    arrival: filled(arrival, startDate),
    // You come home from where you arrived. It is the common case and the one
    // worth guessing; a one-way or open-jaw trip changes the city here.
    departure: filled(departure, endDate),
  };
}

/**
 * Whether the defaults would actually change anything.
 *
 * Used to decide whether to open the travel section: opening it to show
 * nothing new is noise, and filling it while it is closed is worse.
 */
export function wouldFillTravel(current: { arrival: TripLeg; departure: TripLeg }, next: { arrival: TripLeg; departure: TripLeg }): boolean {
  return (
    JSON.stringify(current.arrival) !== JSON.stringify(next.arrival) ||
    JSON.stringify(current.departure) !== JSON.stringify(next.departure)
  );
}
