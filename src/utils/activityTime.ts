import type { Activity } from '../db';

/**
 * Time is the order.
 *
 * Activities used to render in whatever order the array happened to be in, so
 * an 08:00 stop added last sat at the bottom of the day. Sorting on display
 * means a day always reads chronologically, no matter how it was assembled —
 * by the AI, by hand, or by the agent.
 *
 * Because the order is derived, "move up" cannot mean "splice the array": the
 * sort would immediately undo it. Reordering has to change the time, which is
 * what swapTimes does.
 */

/**
 * Coarse times of day, for when the hour genuinely isn't known yet.
 *
 * Stored in the same `time` field as a clock value. Each carries a sort anchor
 * so buckets and exact times interleave sensibly — "Morning" lands before
 * 10:00, "Evening" after 18:30.
 *
 * Unlike a clock time, several activities may share a slot: three things in
 * the evening is a real plan, whereas two things at exactly 19:00 is not.
 */
export const TIME_SLOTS = [
  { id: 'morning', label: 'Morning', anchor: 8 * 60 },
  { id: 'noon', label: 'Noon', anchor: 12 * 60 },
  { id: 'evening', label: 'Evening', anchor: 18 * 60 },
  { id: 'night', label: 'Night', anchor: 21 * 60 },
] as const;

export type TimeSlotId = (typeof TIME_SLOTS)[number]['id'];

export function isTimeSlot(time: string | undefined | null): time is TimeSlotId {
  return TIME_SLOTS.some((s) => s.id === time);
}

/** Minutes since midnight, or null when the value isn't a usable time. */
export function timeToMinutes(time: string | undefined | null): number | null {
  const slot = TIME_SLOTS.find((s) => s.id === time);
  if (slot) return slot.anchor;

  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Chronological order. Entries with no usable time sort last rather than
 * being dropped or thrown to the top — a blank time is unknown, not midnight.
 * Ties keep their existing relative order, so the sort is stable and editing
 * one activity never shuffles its neighbours.
 */
export function sortByTime(activities: Activity[]): Activity[] {
  return [...activities]
    .map((a, i) => ({ a, i, t: timeToMinutes(a.time) }))
    .sort((x, y) => {
      if (x.t === null && y.t === null) return x.i - y.i;
      if (x.t === null) return 1;
      if (y.t === null) return -1;
      return x.t === y.t ? x.i - y.i : x.t - y.t;
    })
    .map((e) => e.a);
}

/**
 * Trade times between two activities.
 *
 * This is what "move up" and "move down" do. Swapping preserves the exact
 * times the user typed instead of inventing a value between two neighbours,
 * which is what dropping a dragged card into a gap would have to do.
 */
export function swapTimes(activities: Activity[], idA: string, idB: string): Activity[] {
  const a = activities.find((x) => x.id === idA);
  const b = activities.find((x) => x.id === idB);
  if (!a || !b) return activities;
  return activities.map((x) =>
    x.id === idA ? { ...x, time: b.time } : x.id === idB ? { ...x, time: a.time } : x,
  );
}

/** 12-hour label, or the slot name. Falls back to the raw value. */
export function formatTime(time: string): string {
  const slot = TIME_SLOTS.find((s) => s.id === time);
  if (slot) return slot.label;
  const mins = timeToMinutes(time);
  if (mins === null) return time || '—';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Other activities on the same day already at this exact clock time.
 *
 * Only exact times clash: you cannot be in Shinjuku and Shibuya at 19:00.
 * Time slots deliberately do not — sharing "Evening" is the whole point of
 * choosing a slot instead of an hour.
 */
export function findTimeClashes(
  activities: Activity[],
  time: string,
  excludeId?: string,
): Activity[] {
  if (isTimeSlot(time) || timeToMinutes(time) === null) return [];
  return activities.filter((a) => a.id !== excludeId && a.time === time);
}

function minutesToTime(mins: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** An hour is the assumed length of an activity when guessing around one. */
const DEFAULT_GAP_MINUTES = 60;

/**
 * A starting time for an activity inserted between two others.
 *
 * Halfway between the neighbours, rounded to a quarter hour when that still
 * lands strictly between them — close enough to where the user pointed that
 * they usually will not change it. Slots bound the gap through their anchors,
 * so a space between Morning and Evening offers an early afternoon. With only
 * one bound (the ends of the day, a blank time) it steps an hour past what is
 * known, and an empty day starts at 09:00.
 */
export function timeBetween(before?: string | null, after?: string | null): string {
  const b = timeToMinutes(before);
  const a = timeToMinutes(after);

  if (b !== null && a !== null && a > b) {
    const mid = (a + b) / 2;
    const quarter = Math.round(mid / 15) * 15;
    return minutesToTime(quarter > b && quarter < a ? quarter : mid);
  }
  if (b !== null) return minutesToTime(b + DEFAULT_GAP_MINUTES);
  if (a !== null) return minutesToTime(a - DEFAULT_GAP_MINUTES);
  return '09:00';
}

/**
 * The next free quarter-hour at or after `time` on this day, for offering a
 * way out of a clash rather than only reporting it. Returns null if the day is
 * somehow full to midnight.
 */
export function nextFreeTime(activities: Activity[], time: string, excludeId?: string): string | null {
  const start = timeToMinutes(time);
  if (start === null) return null;
  const taken = new Set(
    activities.filter((a) => a.id !== excludeId).map((a) => timeToMinutes(a.time)),
  );
  for (let m = start; m < 24 * 60; m += 15) {
    if (!taken.has(m)) return minutesToTime(m);
  }
  return null;
}
