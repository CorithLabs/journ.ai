import type { Day } from '../db';
import { tripDayCount, MAX_TRIP_DAYS } from './tripDuration';

/**
 * Empty day skeletons spanning a plan's date range, for building an itinerary
 * by hand instead of generating one.
 *
 * ItineraryView already supports adding, editing, reordering and deleting
 * activities per day — but it only renders once `plan.itinerary` is non-empty,
 * which previously only AI generation could achieve. Writing these days is what
 * makes the manual route reachable.
 *
 * Labels match the shape the AI is asked to produce ("Day 1 — Mon 14 Jul") so
 * a manually-started itinerary is indistinguishable downstream.
 */
export function scaffoldDays(startDate: string, endDate: string): Day[] {
  const count = tripDayCount(startDate, endDate);
  // Fall back to a single day when the range is missing or reversed — the user
  // can still add more by editing dates; better than refusing to start.
  const days = count != null && count > 0 ? Math.min(count, MAX_TRIP_DAYS) : 1;

  const start = Date.parse(`${startDate?.slice(0, 10)}T00:00:00Z`);
  const hasStart = !Number.isNaN(start);

  return Array.from({ length: days }, (_, dayIndex) => {
    let label = `Day ${dayIndex + 1}`;
    if (hasStart) {
      const date = new Date(start + dayIndex * 24 * 60 * 60 * 1000);
      // UTC throughout so a daylight-saving shift can't move a label by a day.
      const weekday = date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
      const dayOfMonth = date.getUTCDate();
      const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
      label = `Day ${dayIndex + 1} — ${weekday} ${dayOfMonth} ${month}`;
    }
    return { dayIndex, label, activities: [] };
  });
}
