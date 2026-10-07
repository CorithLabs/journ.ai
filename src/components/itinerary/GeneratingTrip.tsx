import { useMemo } from 'react';

interface Props {
  /** What the AI has written so far: a JSON itinerary, arriving in pieces. */
  text: string;
  /** How many days the trip has, when known. */
  totalDays: number | null;
  /** The first answer did not parse and the AI is being asked to fix it. */
  repairing?: boolean;
}

/*
 * Where the pins drop, left to right, on a 320 × 120 sheet. The route is drawn
 * through the same points so every pin lands on it.
 */
const POINTS: Array<[number, number]> = [
  [22, 88], [66, 46], [112, 78], [160, 36], [206, 74], [252, 40], [298, 80],
];
const ROUTE = POINTS.reduce((d, [x, y], i) => {
  if (i === 0) return `M ${x} ${y}`;
  const [px, py] = POINTS[i - 1];
  const mx = (px + x) / 2;
  return `${d} C ${mx} ${py}, ${mx} ${y}, ${x} ${y}`;
}, '');

/** Days and stops written so far, read from the partial JSON. */
export function readProgress(text: string): { days: number; stops: string[] } {
  const days = (text.match(/"label"\s*:\s*"/g) ?? []).length;
  // Only stops whose name has been finished: a half-streamed one would flicker.
  const stops = [...text.matchAll(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
  return { days, stops };
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * The wait while the AI writes the trip.
 *
 * A spinner says only that something is happening. This draws the trip the
 * way the map tab does — pins on a paper sheet — and drops a pin for each
 * stop as the AI names it, so the wait shows the plan taking shape and how
 * far along it is.
 */
export default function GeneratingTrip({ text, totalDays, repairing }: Props) {
  const { days, stops } = useMemo(() => readProgress(text), [text]);
  const still = useMemo(reducedMotion, []);
  const pins = Math.min(stops.length, POINTS.length);
  // Once the sheet is full, keep it full and let the newest stop pulse at the end.
  const newest = pins > 0 ? pins - 1 : -1;
  const day = Math.max(1, days);
  // Days finished, with the one being written counted as half done, so the bar
  // is not full while the last day is still coming.
  const pct = totalDays ? Math.round((Math.max(0, Math.min(days, totalDays) - 0.5) / totalDays) * 100) : null;

  const headline = repairing
    ? 'Tidying up the AI’s answer…'
    : !text
      ? 'Reading your preferences…'
      : totalDays
        ? `Planning day ${Math.min(day, totalDays)} of ${totalDays}`
        : `Planning day ${day}`;

  return (
    <div className="w-full max-w-md mb-4" role="status" aria-live="polite" data-testid="generating-trip">
      <div className="relative rounded-card border border-white/10 bg-surface-overlay/60 overflow-hidden">
        <svg viewBox="0 0 320 120" className="w-full h-auto block" aria-hidden="true">
          {/* The sheet's grid, faint, like the paper map. */}
          {[30, 60, 90].map((y) => <line key={`h${y}`} x1="0" x2="320" y1={y} y2={y} className="stroke-white/5" strokeWidth="1" />)}
          {[64, 128, 192, 256].map((x) => <line key={`v${x}`} x1={x} x2={x} y1="0" y2="120" className="stroke-white/5" strokeWidth="1" />)}

          <path d={ROUTE} fill="none" className="stroke-white/15" strokeWidth="2" strokeDasharray="3 6" strokeLinecap="round" />
          <path d={ROUTE} fill="none" className={`stroke-accent ${still ? '' : 'generating-route'}`} strokeWidth="2" strokeLinecap="round" pathLength={100} />

          {/* A traveller on the route, so the sheet moves before any stop is named. */}
          {!still && (
            <circle r="3.5" className="fill-accent-light">
              <animateMotion dur="4.5s" repeatCount="indefinite" path={ROUTE} />
            </circle>
          )}

          {POINTS.slice(0, pins).map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <g className={still ? '' : 'generating-pin'}>
                {i === newest && !still && <circle r="9" className="fill-accent/25 generating-pulse" />}
                <path d="M0 0 C -6 -8, -7 -13, 0 -17 C 7 -13, 6 -8, 0 0 Z" className="fill-accent" />
                <circle cy="-11" r="2.4" className="fill-surface-base" />
              </g>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 text-left">
        <p className="text-sm font-semibold text-ink-primary" data-testid="generating-headline">{headline}</p>
        {pct !== null && !repairing && (
          <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-[width] duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        )}
        {stops.length > 0 && (
          <ul className="mt-2 space-y-0.5" data-testid="generating-stops" aria-label="Stops so far">
            {stops.slice(-3).map((s, i, shown) => (
              <li
                key={`${stops.length - shown.length + i}-${s}`}
                className={`text-xs truncate ${i === shown.length - 1 ? 'text-ink-secondary generating-stop' : 'text-ink-muted'}`}
              >
                <span className="text-accent mr-1.5" aria-hidden="true">•</span>{s}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-ink-muted">
          {stops.length > 0 ? `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} so far` : 'This usually takes under a minute.'}
        </p>
      </div>
    </div>
  );
}
