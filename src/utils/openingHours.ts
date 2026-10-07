/**
 * Reading OpenStreetMap's opening_hours, enough to warn about a closed day.
 *
 * The full format is large (sunrise, public holidays, week numbers, comments),
 * and getting it subtly wrong would be worse than not trying. So this reads
 * only the part that matters most and is written most consistently: which
 * days, and which dates, a place says it is "off". Anything it does not
 * understand it leaves alone — it can say "closed", never "open".
 */

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_NAMES: Record<string, string> = {
  Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun',
};
const DAY_PLURAL: Record<string, string> = {
  Mo: 'Mondays', Tu: 'Tuesdays', We: 'Wednesdays', Th: 'Thursdays', Fr: 'Fridays', Sa: 'Saturdays', Su: 'Sundays',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mo-We,Fr" → indexes into DAYS. Null if it is not a plain weekday list. */
function weekdays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return [...out];
}

/** "Dec 29-Jan 03" → whether a month/day falls in it. Null if it is not a date range. */
function inDateRange(spec: string, month: number, day: number): boolean | null {
  const m = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:-(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) )?(\d{1,2}))?$/.exec(spec.trim());
  if (!m) return null;
  const from = MONTHS.indexOf(m[1]) * 100 + Number(m[2]);
  const to = m[4] ? MONTHS.indexOf(m[3] ?? m[1]) * 100 + Number(m[4]) : from;
  const at = month * 100 + day;
  return from <= to ? at >= from && at <= to : at >= from || at <= to; // across the new year
}

export interface Closure {
  /** "Closed on Mondays", "Closed 29 Dec – 3 Jan". */
  reason: string;
}

/**
 * Whether the hours say the place is closed on this date. Null when they do
 * not say so — which is not the same as saying it is open.
 */
export function closedOn(hours: string | undefined, isoDate: string | undefined): Closure | null {
  if (!hours || !isoDate) return null;
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const weekday = d.getUTCDay();
  const month = d.getUTCMonth();
  const date = d.getUTCDate();

  for (const raw of hours.split(';')) {
    const rule = raw.trim();
    const off = /^(.*?)\s+(?:off|closed)$/i.exec(rule);
    if (!off) continue;
    const spec = off[1].trim();

    const days = weekdays(spec);
    if (days?.includes(weekday)) {
      const names = spec.split(',').map((p) => p.trim());
      const plain = names.length === 1 && !names[0].includes('-');
      return { reason: plain ? `Closed on ${DAY_PLURAL[names[0]]}` : `Closed ${readableDays(spec)}` };
    }
    if (inDateRange(spec, month, date)) {
      return { reason: `Closed ${readableDates(spec)}` };
    }
  }
  return null;
}

function readableDays(spec: string): string {
  return spec.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (m) => DAY_NAMES[m]).replace(/-/g, '–').replace(/,/g, ', ');
}

function readableDates(spec: string): string {
  // "Dec 29-Jan 03" → "29 Dec – 3 Jan"
  return spec.replace(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})/g, (_, mon, day) => `${Number(day)} ${mon}`)
    .replace(/-(\d{1,2})$/, (_, day) => `–${Number(day)}`)
    .replace(/-/g, ' – ');
}

/**
 * The hours as lines a person reads: "Mo off; Tu-Su 09:00-16:30" →
 * ["Closed Mon", "Tue–Sun 09:00–16:30"].
 */
export function readableHours(hours: string): string[] {
  if (hours.trim() === '24/7') return ['Open 24 hours'];
  return hours.split(';').map((r) => r.trim()).filter(Boolean).map((rule) => {
    const off = /^(.*?)\s+(?:off|closed)$/i.exec(rule);
    const body = (off ? off[1] : rule)
      .replace(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})/g, (_, mon, day) => `${Number(day)} ${mon}`)
      .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (m) => DAY_NAMES[m])
      .replace(/\bPH\b/g, 'public holidays')
      .replace(/(\d{2}:\d{2})-(\d{2}:\d{2})/g, '$1–$2')
      .replace(/(\d{1,2} [A-Z][a-z]{2})-(\d)/g, '$1 – $2')
      .replace(/([A-Za-z]{3})-([A-Za-z]{3})/g, '$1–$2')
      .replace(/,/g, ', ');
    return off ? `Closed ${body}` : body;
  });
}
