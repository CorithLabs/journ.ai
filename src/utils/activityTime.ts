import type { Activity } from '../db';

/**
 * The part of the day is the time.
 *
 * Clock times turned out to be clunky to plan with: picking 14:30 for a museum
 * means inventing precision nobody has, and then defending it every time the
 * day shifts. So Morning / Noon / Evening / Night is the unit a plan is built
 * in, and an exact time is the exception — a 3pm hotel check-in, a flight —
 * carried alongside the slot rather than instead of it.
 *
 * Two rules follow from that:
 *
 *   - An exact time always belongs to a slot. 15:00 shows up under Noon; the
 *     "3:00 PM" is kept and shown, but it is not what orders the day.
 *   - Order within a slot is the array's, which is what makes "move up" work.
 *     Three things in an evening have a sequence but no clock times, so there
 *     is nothing to sort by except the order the user put them in.
 */

/**
 * The four parts of a day, each starting at `from` minutes past midnight.
 * Night wraps past midnight, so it owns everything from 21:00 until Morning.
 */
export const TIME_SLOTS = [
  { id: 'morning', label: 'Morning', from: 5 * 60, hint: '5am – 12pm' },
  { id: 'noon', label: 'Noon', from: 12 * 60, hint: '12pm – 5pm' },
  { id: 'evening', label: 'Evening', from: 17 * 60, hint: '5pm – 9pm' },
  { id: 'night', label: 'Night', from: 21 * 60, hint: '9pm – 5am' },
] as const;

export type TimeSlotId = (typeof TIME_SLOTS)[number]['id'];

const DAY_START = TIME_SLOTS[0].from;
const NIGHT_START = TIME_SLOTS[TIME_SLOTS.length - 1].from;

export function isTimeSlot(time: string | undefined | null): time is TimeSlotId {
  return TIME_SLOTS.some((s) => s.id === time);
}

/** Minutes since midnight for an HH:MM value, or null if it isn't one. */
export function clockMinutes(time: string | undefined | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes since midnight, treating a slot as the moment it begins. */
export function timeToMinutes(time: string | undefined | null): number | null {
  const slot = TIME_SLOTS.find((s) => s.id === time);
  if (slot) return slot.from;
  return clockMinutes(time);
}

/**
 * The part of the day a time falls in — the whole point of the model.
 *
 * A slot is already the answer. A clock time is bucketed: a 3pm check-in
 * copied off a booking lands under Noon without the user filing it there.
 * Anything unreadable has no slot and sorts to the end of the day.
 */
export function slotForTime(time: string | undefined | null): TimeSlotId | null {
  if (isTimeSlot(time)) return time;

  const mins = clockMinutes(time);
  if (mins === null) return null;
  if (mins >= NIGHT_START || mins < DAY_START) return 'night';

  let found: TimeSlotId = TIME_SLOTS[0].id;
  for (const slot of TIME_SLOTS) {
    if (mins >= slot.from) found = slot.id;
  }
  return found;
}

/** Sort rank of a slot. Times with no slot rank last, not first. */
export function slotIndex(time: string | undefined | null): number {
  const slot = slotForTime(time);
  return slot ? TIME_SLOTS.findIndex((s) => s.id === slot) : TIME_SLOTS.length;
}

/**
 * The day in order: by part of the day, then by the order the user arranged.
 *
 * Slots sort against each other, so an evening card can never render above a
 * morning one however the array is arranged. Inside a slot the array wins —
 * exact times deliberately do not sort, because a slot full of nominal cards
 * would have nothing to interleave them with, and "move up" would be unable
 * to change anything.
 */
export function sortByTime(activities: Activity[]): Activity[] {
  return sortBySlot(activities, (a) => a.time);
}

/**
 * The same ordering for anything with a time, so a clipboard item linked to a
 * day can be interleaved with the activities rather than listed apart from
 * them — a 3pm check-in belongs among the afternoon, not in a footnote.
 */
export function sortBySlot<T>(items: T[], timeOf: (item: T) => string | undefined | null): T[] {
  return [...items]
    .map((item, i) => ({ item, i, s: slotIndex(timeOf(item)) }))
    .sort((x, y) => (x.s === y.s ? x.i - y.i : x.s - y.s))
    .map((e) => e.item);
}

/** Lift `id` out and drop it back beside `otherId`, above it or below it. */
function placeBeside(
  activities: Activity[],
  id: string,
  otherId: string,
  dir: 'up' | 'down',
): Activity[] {
  const moving = activities.find((a) => a.id === id);
  const rest = activities.filter((a) => a.id !== id);
  const oi = rest.findIndex((a) => a.id === otherId);
  if (!moving || oi < 0) return activities;

  const at = dir === 'up' ? oi : oi + 1;
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

/**
 * Move an activity one place up or down the day.
 *
 * Crossing into the neighbour's part of the day is what changes the time: the
 * card takes the neighbour's slot, and any exact clock time goes with it —
 * "3:00 PM" stops being true the moment the card is in the evening. Within a
 * slot nothing about the time changes; the two cards simply trade places.
 *
 * Returns the array unchanged when there is nowhere to go, so callers can
 * treat identity as "no move".
 */
export function moveActivity(
  activities: Activity[],
  id: string,
  dir: 'up' | 'down',
): Activity[] {
  const sorted = sortByTime(activities);
  const idx = sorted.findIndex((a) => a.id === id);
  if (idx < 0) return activities;

  const ni = dir === 'up' ? idx - 1 : idx + 1;
  if (ni < 0 || ni >= sorted.length) return activities;

  const other = sorted[ni];
  const movingSlot = slotForTime(sorted[idx].time);
  const otherSlot = slotForTime(other.time);

  const retimed =
    movingSlot === otherSlot
      ? activities
      : activities.map((a) => (a.id === id ? { ...a, time: otherSlot ?? '' } : a));

  return placeBeside(retimed, id, other.id, dir);
}

/** The part of the day, for the chip on a card. */
export function slotLabel(time: string | undefined | null): string {
  const slot = slotForTime(time);
  return slot ? TIME_SLOTS.find((s) => s.id === slot)!.label : '—';
}

/**
 * The clock time, when there is a real one worth showing beside the slot —
 * losing "check in at 3pm" to a bucket labelled Noon would be worse than the
 * precision the buckets were meant to spare the user.
 */
export function exactTime(time: string | undefined | null): string | null {
  return clockMinutes(time) === null ? null : (time as string).trim();
}

/** 12-hour label, or the slot name. Falls back to the raw value. */
export function formatTime(time: string): string {
  const slot = TIME_SLOTS.find((s) => s.id === time);
  if (slot) return slot.label;
  const mins = clockMinutes(time);
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
 * Slots deliberately do not — sharing an evening is the whole point of
 * choosing one.
 */
export function findTimeClashes(
  activities: Activity[],
  time: string,
  excludeId?: string,
): Activity[] {
  if (isTimeSlot(time) || clockMinutes(time) === null) return [];
  return activities.filter((a) => a.id !== excludeId && a.time === time);
}

function minutesToTime(mins: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
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
