import type { Activity, Day, Plan, TodoItem } from '../db';
import { slotForTime, slotIndex, sortByTime, type TimeSlotId } from './activityTime';
import { cityForDay } from './dayCity';
import { todayIso, todayDayIndex, dateForDayIndex } from './tripDay';

/**
 * A trip is three different jobs, and the app was only ever doing one.
 *
 * Before departure it is a planning tool and the question is "am I ready".
 * During, it is a companion and the question is "what now, and where". After,
 * it is a record and there is no question at all — but every prompt to plan
 * something is now noise.
 *
 * `tripTiming` has known which of the three applied since day one; almost
 * nothing read it. These are the facts each phase actually needs, kept apart
 * from how they are drawn so the decisions can be checked directly.
 */

/** Which part of the day it is right now, on the device's own clock. */
export function currentSlot(now: Date = new Date()): TimeSlotId {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  // Every minute of the day falls in a slot — night wraps midnight — so the
  // fallback is unreachable and only satisfies the type.
  return slotForTime(`${hh}:${mm}`) ?? 'morning';
}

export interface Readiness {
  totalDays: number;
  /** Days with nothing in them at all. */
  emptyDays: number[];
  /** The first of those, which is where "keep planning" should land. */
  firstEmptyDay: number | null;
  openTodos: number;
  doneTodos: number;
  /** Open tasks whose due date has already passed. */
  overdue: TodoItem[];
  /** The next open task with a due date, soonest first. */
  nextDue: TodoItem | null;
  /** Open tasks due before the trip starts — the ones departure depends on. */
  dueBeforeDeparture: number;
}

/**
 * How ready a trip is, for the phase where that is the only question.
 *
 * Deliberately counts empty days rather than judging full ones: an itinerary
 * with one thing on a day is a decision someone made, and telling them it is
 * thin is second-guessing. A day with nothing on it is a gap they can see is
 * a gap.
 */
export function readiness(
  plan: Pick<Plan, 'itinerary' | 'startDate'>,
  todos: TodoItem[],
  now: Date = new Date(),
): Readiness {
  const emptyDays = plan.itinerary
    .filter((d) => d.activities.length === 0)
    .map((d) => d.dayIndex)
    .sort((a, b) => a - b);

  const open = todos.filter((t) => t.status !== 'done');
  const today = todayIso(now);
  const dated = open
    .filter((t) => t.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));

  const start = plan.startDate?.slice(0, 10);

  return {
    totalDays: plan.itinerary.length,
    emptyDays,
    firstEmptyDay: emptyDays[0] ?? null,
    openTodos: open.length,
    doneTodos: todos.length - open.length,
    overdue: dated.filter((t) => t.dueDate! < today),
    nextDue: dated.find((t) => t.dueDate! >= today) ?? null,
    dueBeforeDeparture: start ? dated.filter((t) => t.dueDate! <= start).length : 0,
  };
}

export interface TodayGlance {
  dayIndex: number;
  day: Day;
  city: string;
  /** Slots that have already been and gone. */
  done: Activity[];
  /** What is happening in the part of the day it is now. */
  now: Activity[];
  /** Everything still ahead today. */
  later: Activity[];
  /** Tomorrow, when the trip has one. */
  tomorrow: Day | null;
}

/**
 * Today, split by where the clock has got to.
 *
 * The during-trip case was served worst: a traveller on day four opened day
 * one and scrolled. Even after jump-to-today, a day is a list you read from
 * the top — at 6pm the first thing on it is the thing you did this morning.
 */
export function todayGlance(plan: Plan, now: Date = new Date()): TodayGlance | null {
  const dayIndex = todayDayIndex(plan, now);
  if (dayIndex === null) return null;
  const day = plan.itinerary.find((d) => d.dayIndex === dayIndex);
  if (!day) return null;

  const here = slotIndex(currentSlot(now));
  const sorted = sortByTime(day.activities);

  return {
    dayIndex,
    day,
    city: cityForDay(plan, day),
    done: sorted.filter((a) => slotIndex(a.time) < here),
    now: sorted.filter((a) => slotIndex(a.time) === here),
    later: sorted.filter((a) => slotIndex(a.time) > here),
    tomorrow: plan.itinerary.find((d) => d.dayIndex === dayIndex + 1) ?? null,
  };
}

export interface TripRecord {
  days: number;
  activities: number;
  cities: string[];
  endedDaysAgo: number | null;
}

/**
 * What a finished trip amounts to.
 *
 * A past trip should stop asking to be planned. Everything here is a count of
 * what happened, and nothing in it is a prompt.
 */
export function tripRecord(plan: Plan, now: Date = new Date()): TripRecord {
  const cities: string[] = [];
  for (const day of plan.itinerary) {
    const city = cityForDay(plan, day);
    // Consecutive repeats only: returning to a city later in the trip is a
    // second visit and worth showing as one.
    if (city && cities[cities.length - 1] !== city) cities.push(city);
  }

  const end = Date.parse(`${plan.endDate?.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayIso(now)}T00:00:00Z`);

  return {
    days: plan.itinerary.length,
    activities: plan.itinerary.reduce((n, d) => n + d.activities.length, 0),
    cities,
    endedDaysAgo: Number.isNaN(end) ? null : Math.round((today - end) / 86400000),
  };
}

/** The ISO date of a day, for looking its weather up. */
export function dateOfDay(plan: Pick<Plan, 'startDate'>, dayIndex: number): string | null {
  return dateForDayIndex(plan.startDate, dayIndex);
}
