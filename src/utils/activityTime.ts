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

/** Minutes since midnight, or null when the value isn't a usable HH:MM. */
export function timeToMinutes(time: string | undefined | null): number | null {
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

/** 12-hour label for display, e.g. "8:00 AM". Falls back to the raw value. */
export function formatTime(time: string): string {
  const mins = timeToMinutes(time);
  if (mins === null) return time || '—';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
