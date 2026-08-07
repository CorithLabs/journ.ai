/**
 * Trip-duration limits.
 *
 * Trips are capped at MAX_TRIP_DAYS (14) to stay within the itinerary
 * generation token budget (`max_tokens: 8000`). A longer trip would produce a
 * response that gpt-4o-mini truncates mid-JSON, causing the "itinerary too
 * long" parse failure. The limit is enforced in two places:
 *   1. NewPlanModal — date-picker validation on plan creation.
 *   2. GenerateItinerary — blocks generation for a plan already on disk whose
 *      range exceeds the cap (created before the cap shipped, or duplicated).
 *      IntakeChat has no dates step, so generation is the second gate.
 */
export const MAX_TRIP_DAYS = 14;

/**
 * Inclusive day count for a trip: a start date equal to the end date is 1 day.
 * Returns null when either date is missing or unparseable so callers can skip
 * the length check (other validation handles empty / invalid ranges).
 *
 * Uses UTC midnight for both endpoints so daylight-saving transitions never
 * shift the count by a day.
 */
export function tripDayCount(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
): number | null {
  if (!startDate || !endDate) return null;
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end - start) / msPerDay) + 1;
}

/**
 * True when the range spans more than MAX_TRIP_DAYS. A missing/invalid range
 * (dayCount === null) or a reversed range (dayCount <= 0) is NOT flagged here —
 * those are handled by the caller's own "end before start" validation.
 */
export function exceedsMaxTripDays(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
): boolean {
  const count = tripDayCount(startDate, endDate);
  if (count === null) return false;
  return count > MAX_TRIP_DAYS;
}

export const MAX_TRIP_DAYS_ERROR =
  'Maximum trip length is 14 days. Please shorten your trip.';

/**
 * Message for a plan whose saved dates already exceed the cap — names the
 * actual span so the user knows by how much, and points at the two ways out.
 */
export function tooLongForGenerationMessage(dayCount: number | null): string {
  const span = dayCount === null ? 'Your dates' : `Your dates span ${dayCount} days, which`;
  return `${span} exceeds the ${MAX_TRIP_DAYS}-day maximum. Shorten the trip, or split it into two plans.`;
}
