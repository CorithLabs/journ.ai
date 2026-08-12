import { describe, it, expect } from 'vitest';
import { spreadCoincident } from '../MapboxMap';
import { haversineKm } from '../../../services/mapbox';
import type { PinActivity } from '../../../services/mapbox';

const pin = (id: string, coords: [number, number]): PinActivity => ({
  activity: { id, name: id, time: '09:00', locationName: 'Shibuya', notes: '', pinnedToTodo: false, coordinates: coords },
  dayIndex: 0,
  dayLabel: 'Day 1',
  sequenceNumber: 1,
  dayColor: '#000',
});

const SHIBUYA: [number, number] = [139.7016, 35.658];
const UENO: [number, number] = [139.7745, 35.7138];

/*
 * The other half of "not everything shows on the map": several cards with only
 * a neighbourhood for a location geocode to the same point, Mapbox stacks the
 * markers, and every one but the top is invisible and untappable.
 */
describe('pins that landed on the same point', () => {
  it('leaves a pin standing alone exactly where it is', () => {
    expect(spreadCoincident([pin('a', SHIBUYA), pin('b', UENO)])).toEqual([SHIBUYA, UENO]);
  });

  it('separates pins that share a point', () => {
    const placed = spreadCoincident([pin('a', SHIBUYA), pin('b', SHIBUYA), pin('c', SHIBUYA)]);
    expect(new Set(placed.map(String)).size).toBe(3);
  });

  it('moves them only far enough to be seen, not far enough to mislead', () => {
    const placed = spreadCoincident([pin('a', SHIBUYA), pin('b', SHIBUYA)]);
    for (const p of placed) {
      const metres = haversineKm(SHIBUYA, p) * 1000;
      expect(metres).toBeGreaterThan(5);
      expect(metres).toBeLessThan(60);
    }
  });

  it('places the same pins the same way every time', () => {
    const pins = [pin('a', SHIBUYA), pin('b', SHIBUYA)];
    expect(spreadCoincident(pins)).toEqual(spreadCoincident(pins));
  });

  it('spreads each cluster around its own point', () => {
    const placed = spreadCoincident([
      pin('a', SHIBUYA), pin('b', UENO), pin('c', SHIBUYA), pin('d', UENO),
    ]);
    expect(haversineKm(SHIBUYA, placed[0]) * 1000).toBeLessThan(60);
    expect(haversineKm(UENO, placed[1]) * 1000).toBeLessThan(60);
    expect(haversineKm(SHIBUYA, placed[2]) * 1000).toBeLessThan(60);
    expect(haversineKm(UENO, placed[3]) * 1000).toBeLessThan(60);
  });
});
