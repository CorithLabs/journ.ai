import type { Plan } from '../db';
import { tripDayCount } from './tripDuration';

/**
 * Where a trip is in its own timeline.
 *
 * Without this the app has no idea what day it is: a traveller opening it in
 * Percé on day four landed on day one and scrolled. Planning a trip and being
 * on one are different jobs, and only the first was being done.
 *
 * Dates are compared in UTC throughout, matching scaffoldDays — a daylight
 * saving shift must not move a day by one. The consequence is that "today" is
 * the traveller's calendar date as their device reports it, which is what they
 * mean by today wherever they happen to be.
 */

export type TripStatus = 'upcoming' | 'active' | 'past' | 'unknown';

/** Today as an ISO date, in the device's own calendar. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The ISO date a given day of the trip falls on. */
export function dateForDayIndex(startDate: string, dayIndex: number): string | null {
  const start = Date.parse(`${startDate?.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || dayIndex < 0) return null;
  return new Date(start + dayIndex * 86400000).toISOString().slice(0, 10);
}

/**
 * Which day of the trip today is, or null when the trip is not running.
 *
 * Counted from the start date rather than searched for in the itinerary, so it
 * is right even for a plan whose days were never generated.
 */
export function todayDayIndex(
  plan: Pick<Plan, 'startDate' | 'endDate'>,
  now: Date = new Date(),
): number | null {
  const start = Date.parse(`${plan.startDate?.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayIso(now)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(today)) return null;

  const index = Math.round((today - start) / 86400000);
  if (index < 0) return null;

  const count = tripDayCount(plan.startDate, plan.endDate);
  // A trip with no usable end date still has a day one; better to know that
  // than to know nothing.
  if (count != null && index >= count) return null;
  return index;
}

export interface TripTiming {
  status: TripStatus;
  /** Day of the trip today is, when it is running. */
  todayIndex: number | null;
  /** Whole days until departure, when it has not started. */
  daysUntil: number | null;
  /** Days left including today, when it is running. */
  daysRemaining: number | null;
}

export function tripTiming(
  plan: Pick<Plan, 'startDate' | 'endDate'>,
  now: Date = new Date(),
): TripTiming {
  const start = Date.parse(`${plan.startDate?.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${plan.endDate?.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayIso(now)}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(today)) {
    return { status: 'unknown', todayIndex: null, daysUntil: null, daysRemaining: null };
  }

  if (today < start) {
    return {
      status: 'upcoming',
      todayIndex: null,
      daysUntil: Math.round((start - today) / 86400000),
      daysRemaining: null,
    };
  }

  if (!Number.isNaN(end) && today > end) {
    return { status: 'past', todayIndex: null, daysUntil: null, daysRemaining: null };
  }

  const index = todayDayIndex(plan, now);
  return {
    status: index === null ? 'past' : 'active',
    todayIndex: index,
    daysUntil: null,
    daysRemaining:
      index === null || Number.isNaN(end) ? null : Math.round((end - today) / 86400000) + 1,
  };
}

/** "Today", "Tomorrow", "In 3 days", "Yesterday" — or null when it is none. */
export function relativeDayLabel(
  startDate: string,
  dayIndex: number,
  now: Date = new Date(),
): string | null {
  const date = dateForDayIndex(startDate, dayIndex);
  if (!date) return null;
  const diff = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayIso(now)}T00:00:00Z`)) / 86400000,
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return null;
}
