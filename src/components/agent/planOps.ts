import type { Activity, Plan } from '../../db';
import { TIME_SLOTS, clockMinutes, isTimeSlot, slotForTime, slotIndex, slotLabel, exactTime, formatTime } from '../../utils/activityTime';

/*
 * What the assistant needs to act on the plan precisely: a handle for each
 * activity, a forgiving way to find one by name that says when it cannot tell
 * which, times in the app's own terms, and placement that puts an activity
 * where the day reads it.
 */

/** A short, stable handle for an activity, shown to the model beside it. */
export function activityRef(a: Pick<Activity, 'id'>): string {
  return a.id.replace(/-/g, '').slice(0, 6);
}

/** Lowercase, accents and punctuation gone: "Sensō-ji" and "senso ji" match. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface Located {
  dayIndex: number;
  activity: Activity;
}

export type Resolution =
  | { kind: 'found'; hit: Located }
  | { kind: 'ambiguous'; hits: Located[] }
  | { kind: 'missing' };

/**
 * Find one activity, by ref or by name, optionally on one day.
 *
 * By name: an exact name wins; otherwise every word asked for must appear.
 * More than one match is reported, not guessed at — "the museum" on two days
 * used to mean whichever came first, which is how a swap moved the wrong one.
 */
export function resolveActivity(
  plan: Pick<Plan, 'itinerary'>,
  q: { ref?: unknown; nameMatch?: unknown; dayIndex?: unknown },
): Resolution {
  const day = q.dayIndex != null && q.dayIndex !== '' ? Number(q.dayIndex) : null;
  const all: Located[] = plan.itinerary.flatMap((d) =>
    day != null && d.dayIndex !== day ? [] : d.activities.map((activity) => ({ dayIndex: d.dayIndex, activity })),
  );

  const ref = typeof q.ref === 'string' ? q.ref.trim().replace(/^\[|\]$/g, '').toLowerCase() : '';
  if (ref) {
    const hit = all.find((h) => activityRef(h.activity) === ref || h.activity.id === ref);
    if (hit) return { kind: 'found', hit };
  }

  const wanted = typeof q.nameMatch === 'string' ? normalizeName(q.nameMatch) : '';
  if (!wanted) return { kind: 'missing' };

  const exact = all.filter((h) => normalizeName(h.activity.name) === wanted);
  if (exact.length === 1) return { kind: 'found', hit: exact[0] };
  if (exact.length > 1) return { kind: 'ambiguous', hits: exact };

  const words = wanted.split(' ');
  const hits = all.filter((h) => {
    const name = normalizeName(`${h.activity.name} ${h.activity.locationName}`);
    return words.every((w) => name.includes(w));
  });
  if (hits.length === 1) return { kind: 'found', hit: hits[0] };
  if (hits.length > 1) return { kind: 'ambiguous', hits };
  return { kind: 'missing' };
}

/** "Day 1: Senso-ji [ab12cd], Day 2: Senso-ji at night [ef34ab]" */
export function listHits(hits: Located[]): string {
  return hits.map((h) => `Day ${h.dayIndex + 1}: ${h.activity.name} [${activityRef(h.activity)}]`).join(', ');
}

/** The message for a lookup that did not land on exactly one activity. */
export function resolutionError(r: Exclude<Resolution, { kind: 'found' }>, asked: unknown): string {
  return r.kind === 'ambiguous'
    ? `More than one activity matches "${String(asked ?? '')}": ${listHits(r.hits)}. Say which, by its ref or its day.`
    : `I couldn't find an activity matching "${String(asked ?? '')}".`;
}

/**
 * A time as the app keeps it: a part of the day, or 24h HH:MM.
 *
 * Accepts what people and models write — "morning", "afternoon", "9am",
 * "7:30 pm", "19:30" — and returns null for anything else, so a bad value is
 * caught rather than stored.
 */
export function normalizeTime(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (isTimeSlot(s)) return s;
  const words: Record<string, string> = {
    breakfast: 'morning', am: 'morning', midday: 'noon', lunch: 'noon', afternoon: 'noon',
    dinner: 'evening', supper: 'evening', 'late night': 'night', late: 'night', tonight: 'evening',
  };
  if (words[s]) return words[s];
  if (clockMinutes(s) !== null) {
    const [h, m] = s.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(s);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3] === 'pm') h += 12;
    const m = ampm[2] ?? '00';
    if (h > 23 || Number(m) > 59) return null;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  return null;
}

/** "Morning", or "Noon · 3:00 PM" when there is a real clock time. */
export function describeTime(time: string): string {
  const exact = exactTime(time);
  return exact ? `${slotLabel(time)} · ${formatTime(exact)}` : slotLabel(time);
}

/**
 * The day in the order it is shown, with `act` placed where it belongs.
 *
 * The itinerary orders by part of the day and, within one, by list order — so
 * appending a morning activity put it below the morning's others, or, with no
 * time, at the end of the day. It now goes:
 *   - before or after a named neighbour, when asked;
 *   - first or last in its part of the day, when asked;
 *   - otherwise among its part of the day by clock time, after untimed ones.
 * The array comes back in display order, so list order and screen agree.
 */
export function placeInDay(
  activities: Activity[],
  act: Activity,
  opts: { position?: unknown; before?: Activity; after?: Activity } = {},
): Activity[] {
  const rest = [...activities.filter((a) => a.id !== act.id)]
    .map((a, i) => ({ a, i, s: slotIndex(a.time) }))
    .sort((x, y) => (x.s === y.s ? x.i - y.i : x.s - y.s))
    .map((e) => e.a);

  if (opts.before || opts.after) {
    const anchor = (opts.before ?? opts.after)!;
    const at = rest.findIndex((a) => a.id === anchor.id);
    if (at >= 0) {
      // Beside a neighbour means in its part of the day.
      const placed = { ...act, time: slotForTime(act.time) === slotForTime(anchor.time) ? act.time : anchor.time };
      const i = opts.before ? at : at + 1;
      return [...rest.slice(0, i), placed, ...rest.slice(i)];
    }
  }

  const s = slotIndex(act.time);
  const sameSlot = rest.map((a, i) => ({ a, i })).filter(({ a }) => slotIndex(a.time) === s);
  const firstAfterSlot = rest.findIndex((a) => slotIndex(a.time) > s);
  const slotEnd = firstAfterSlot < 0 ? rest.length : firstAfterSlot;
  const slotStart = sameSlot.length ? sameSlot[0].i : slotEnd;

  let i: number;
  if (opts.position === 'first') i = slotStart;
  else if (opts.position === 'last') i = slotEnd;
  else {
    const mine = clockMinutes(act.time);
    if (mine === null) i = slotEnd;
    else {
      const later = sameSlot.find(({ a }) => (clockMinutes(a.time) ?? -1) > mine);
      i = later ? later.i : slotEnd;
    }
  }
  return [...rest.slice(0, i), act, ...rest.slice(i)];
}

/**
 * A sensible part of the day for an activity given none: the one after the
 * day's latest, so "add dinner" on a day of morning sights does not land at
 * dawn. Morning on an empty day.
 */
export function nextSlot(activities: Activity[]): string {
  const last = activities.reduce((m, a) => Math.max(m, slotIndex(a.time) >= TIME_SLOTS.length ? -1 : slotIndex(a.time)), -1);
  return TIME_SLOTS[Math.min(last + 1, TIME_SLOTS.length - 1)].id;
}

/** The same activity already in the trip, by name, if there is one. */
export function findDuplicate(plan: Pick<Plan, 'itinerary'>, name: string, dayIndex?: number): Located | null {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  for (const d of plan.itinerary) {
    if (dayIndex != null && d.dayIndex !== dayIndex) continue;
    const a = d.activities.find((x) => normalizeName(x.name) === wanted);
    if (a) return { dayIndex: d.dayIndex, activity: a };
  }
  return null;
}
