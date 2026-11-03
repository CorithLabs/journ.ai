import type { Day } from '../db';
import { scaffoldDays } from './scaffoldDays';
import { tripDayCount, MAX_TRIP_DAYS } from './tripDuration';

/** "Day 3 — Fri 21 Nov": the label the app writes itself, dated. */
const DATED = /^Day \d+( — \w{3} \d{1,2} \w{3})?$/;

/**
 * The itinerary's days, fitted to new trip dates.
 *
 * Days keep their order: a day's date is the trip's start plus its place in
 * the list, so moving the start moves every day with it. A longer trip gets
 * empty days at the end; a shorter one loses days from the end — `removed`
 * says which, so whoever changes the dates can be told before it happens.
 *
 * Labels the app wrote ("Day 2 — Thu 20 Nov") are rewritten for the new
 * dates; a themed one ("Day 2 — Temples and gardens") keeps its theme with
 * its number put right.
 *
 * Changing the dates used to leave the days as they were, with a note saying
 * so — so a one-day trip stretched to five still showed one day.
 */
export function fitDaysToDates(days: Day[], startDate: string, endDate: string): { days: Day[]; removed: Day[] } {
  const count = tripDayCount(startDate, endDate);
  // Dates that are missing or reversed say nothing about the days; leave them.
  if (count == null || count < 1) return { days, removed: [] };
  const target = Math.min(count, MAX_TRIP_DAYS);
  const fresh = scaffoldDays(startDate, endDate);

  const kept = days.slice(0, target);
  const removed = days.slice(target);
  const fitted: Day[] = [...kept, ...fresh.slice(kept.length, target)].map((day, i) => {
    const dated = fresh[i]?.label ?? `Day ${i + 1}`;
    const label = DATED.test(day.label) ? dated : day.label.replace(/^Day \d+/, `Day ${i + 1}`);
    return { ...day, dayIndex: i, label };
  });
  return { days: fitted, removed };
}
