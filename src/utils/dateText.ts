/**
 * Short dates for the itinerary — "Sat 10", "Fri 9 Oct", "9–11 Oct 2026".
 *
 * Spelled out rather than left to toLocaleDateString: en-GB abbreviates
 * September to "Sept", which made one month in twelve look like a typo next
 * to the others. All dates are ISO days read at UTC midnight, so a timezone
 * west of Greenwich cannot move a trip day to the day before.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function utc(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sat" */
export function weekdayOf(iso: string | undefined | null): string | null {
  const d = utc(iso);
  return d ? WEEKDAYS[d.getUTCDay()] : null;
}

/** "Sat 10" — enough to find a day within a trip. */
export function dayOfWeekAndDate(iso: string | undefined | null): string | null {
  const d = utc(iso);
  return d ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}` : null;
}

/** "Sat 10 Oct" */
export function shortDate(iso: string | undefined | null): string | null {
  const d = utc(iso);
  return d ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : null;
}

/** "9–11 Oct 2026", "28 Sep – 3 Oct 2026", "30 Dec 2026 – 2 Jan 2027". */
export function dateRange(start: string | undefined | null, end: string | undefined | null): string | null {
  const a = utc(start);
  if (!a) return null;
  const b = utc(end);
  const dm = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (!b || b.getTime() === a.getTime()) return `${dm(a)} ${a.getUTCFullYear()}`;
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${dm(a)} ${a.getUTCFullYear()} – ${dm(b)} ${b.getUTCFullYear()}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${dm(a)} – ${dm(b)} ${b.getUTCFullYear()}`;
  return `${a.getUTCDate()}–${dm(b)} ${b.getUTCFullYear()}`;
}
