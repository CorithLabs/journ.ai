import { haversineKm } from '../../services/places';

/**
 * The arithmetic of drawing a trip on a sheet of paper.
 *
 * No map library and no tiles: stops are placed by their real coordinates on
 * an equirectangular projection fitted to the sheet. Over a city or a day out
 * the distortion is far below anything a sketch map could show, and the
 * alternative — a slippy map — needs a service, a key and a network.
 */

export type LngLat = [number, number];

/**
 * Anything further than this from the main group of stops is not allowed to
 * shrink the sheet to fit it. Tokyo to Nikko is ~120km; at one scale the
 * whole of Tokyo would be a dot.
 */
export const FAR_KM = 40;

export interface Box { x: number; y: number; w: number; h: number }
export interface Pad { l: number; r: number; t: number; b: number }

export interface Projection {
  xy: (at: LngLat) => [number, number];
  ll: (x: number, y: number) => LngLat;
  /** Screen pixels per kilometre on the ground. */
  pxPerKm: number;
}

/** The middle of a set of points, by median, so one far stop cannot drag it. */
export function medianPoint(points: LngLat[]): LngLat {
  const lngs = points.map((p) => p[0]).sort((a, b) => a - b);
  const lats = points.map((p) => p[1]).sort((a, b) => a - b);
  const mid = Math.floor(points.length / 2);
  return [lngs[mid], lats[mid]];
}

/** Indexes of the points near the main group, and of the ones far from it. */
export function splitNearFar(points: LngLat[]): { near: number[]; far: number[]; mid: LngLat } {
  if (!points.length) return { near: [], far: [], mid: [0, 0] };
  const mid = medianPoint(points);
  const near: number[] = [];
  const far: number[] = [];
  points.forEach((p, i) => (haversineKm(p, mid) <= FAR_KM ? near : far).push(i));
  return { near, far, mid };
}

/** Smallest area a sheet will show, in degrees: one pin still gets a neighbourhood. */
const MIN_SPAN = 0.012;

export function fitProjection(points: LngLat[], box: Box, pad: Pad): Projection {
  const lat0 = points.length ? points.reduce((s, p) => s + p[1], 0) / points.length : 0;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p[0] * kx);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = Math.max(maxX - minX, MIN_SPAN);
  const dy = Math.max(maxY - minY, MIN_SPAN);
  const innerW = Math.max(box.w - pad.l - pad.r, 1);
  const innerH = Math.max(box.h - pad.t - pad.b, 1);
  const s = Math.min(innerW / dx, innerH / dy);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ox = box.x + pad.l + innerW / 2;
  const oy = box.y + pad.t + innerH / 2;
  return {
    xy: (at) => [ox + (at[0] * kx - cx) * s, oy - (at[1] - cy) * s],
    ll: (x, y) => [((x - ox) / s + cx) / kx, cy - (y - oy) / s],
    pxPerKm: s / 111.32,
  };
}

/** A round distance for the scale bar, as close as possible to `wantPx` long. */
export function niceScaleKm(pxPerKm: number, wantPx: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];
  return steps.reduce((best, k) =>
    Math.abs(k * pxPerKm - wantPx) < Math.abs(best * pxPerKm - wantPx) ? k : best, 1);
}

/** Spacing for the faint latitude and longitude lines. */
export function graticuleStep(spanDeg: number, maxLines: number): number {
  return [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].find((s) => spanDeg / s <= maxLines) ?? 1;
}

const WORDS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** "north", "southwest" — which way `to` lies from `from`. */
export function directionWord(from: LngLat, to: LngLat): string {
  const dx = (to[0] - from[0]) * Math.cos((from[1] * Math.PI) / 180);
  const dy = to[1] - from[1];
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return WORDS[Math.round(deg / 45) % 8];
}

/**
 * The neighbourhood an activity's location names, for the faint district
 * labels: "Asakusa, Tokyo" → "Asakusa".
 *
 * Only when the location actually has two parts, and the first is neither
 * the activity itself nor a city of the trip — "Senso-ji Temple" names no
 * district, and "Tokyo, Japan" is the city, which the sheet is titled with.
 */
export function districtOf(locationName: string, activityName: string, cities: string[]): string | null {
  const parts = locationName.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0];
  const lower = first.toLowerCase();
  if (lower === activityName.trim().toLowerCase()) return null;
  if (cities.some((c) => c.split(',')[0].trim().toLowerCase() === lower)) return null;
  // A street address is not a district.
  if (/\d/.test(first)) return null;
  return first;
}

/**
 * Where on the frame an arrow toward `to` should sit: the point where the
 * line from `from` leaves the box.
 */
export function edgePoint(
  from: [number, number],
  to: [number, number],
  box: Box,
): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const tx = dx > 0 ? (box.x + box.w - from[0]) / dx : dx < 0 ? (box.x - from[0]) / dx : Infinity;
  const ty = dy > 0 ? (box.y + box.h - from[1]) / dy : dy < 0 ? (box.y - from[1]) / dy : Infinity;
  const t = Math.min(tx, ty, 1);
  return [from[0] + dx * t, from[1] + dy * t];
}

/** A day colour deepened enough to read as ink on cream paper. */
export function inkOf(hex: string, amount = 0.38): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}
