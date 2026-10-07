import type { PinActivity } from '../../services/places';

/**
 * How far apart to nudge pins that landed on the same point, in metres.
 *
 * Small enough to still read as "here", large enough to separate two 28px
 * circles at the zoom a day's stops are viewed at.
 */
const SPREAD_METRES = 35;

/**
 * Where each pin is actually drawn, with co-located ones fanned out.
 *
 * Activities in the same vague place — two things in Shibuya, three stops with
 * only a neighbourhood for a location — geocode to exactly the same point, and
 * Mapbox stacks the markers. The ones underneath are invisible and cannot be
 * tapped, so a day of five cards showed three pins and looked like it had lost
 * two. Nothing was lost; they were hidden.
 *
 * Nudging is honest here because the positions were interchangeable already:
 * they are one lookup result repeated, not two places that were measured.
 */
export function spreadCoincident(pins: PinActivity[]): Array<[number, number]> {
  const groups = new Map<string, number[]>();
  pins.forEach((pin, i) => {
    const [lng, lat] = pin.activity.coordinates!;
    // Rounded, because the same place looked up twice can differ in the last
    // decimal — still the same point on any screen.
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });

  const placed: Array<[number, number]> = pins.map((p) => p.activity.coordinates!);
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.forEach((pinIndex, k) => {
      const [lng, lat] = pins[pinIndex].activity.coordinates!;
      const angle = (2 * Math.PI * k) / members.length;
      const dLat = (SPREAD_METRES * Math.sin(angle)) / 111320;
      const dLng =
        (SPREAD_METRES * Math.cos(angle)) /
        (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
      placed[pinIndex] = [lng + dLng, lat + dLat];
    });
  }
  return placed;
}
