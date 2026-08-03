import { describe, it, expect } from 'vitest';
import { routeDistance, applyReorder } from '../routeDistance';
import { type Activity } from '../../db';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeActivity(id: string, name = `Activity ${id}`): Activity {
  return {
    id,
    name,
    time: '09:00',
    locationName: `Location ${id}`,
    notes: '',
    pinnedToTodo: false,
  };
}

// ─── routeDistance ────────────────────────────────────────────────────────

describe('routeDistance', () => {
  it('returns 0 for an empty array', () => {
    expect(routeDistance([])).toBe(0);
  });

  it('returns 0 for a single point', () => {
    expect(routeDistance([[139.77, 35.66]])).toBe(0);
  });

  it('returns 0 for two identical consecutive points', () => {
    const coord: [number, number] = [139.77, 35.66];
    expect(routeDistance([coord, coord])).toBe(0);
  });

  it('calculates correct distance between two known points', () => {
    // Tokyo (139.6917, 35.6895) → Osaka (135.5023, 34.6937)
    // Known straight-line distance ≈ 395–400 km
    const tokyo: [number, number] = [139.6917, 35.6895];
    const osaka: [number, number] = [135.5023, 34.6937];
    const dist = routeDistance([tokyo, osaka]);
    expect(dist).toBeGreaterThan(390);
    expect(dist).toBeLessThan(410);
  });

  it('calculates correct total for 5 points', () => {
    // Known-distance segments using latitude degrees (1° lat ≈ 111.2 km)
    // A(0,0) → B(0,1) → C(0,2) → D(0,3) → E(0,4)
    // Each segment ≈ 111.19 km, total ≈ 444.78 km
    const coords: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ];
    const dist = routeDistance(coords);
    // 4 segments × ~111.19 km each
    expect(dist).toBeGreaterThan(440);
    expect(dist).toBeLessThan(450);
  });

  it('adds 0 for identical consecutive points within a sequence', () => {
    const a: [number, number] = [0, 0];
    const b: [number, number] = [0, 1]; // ≈ 111.19 km
    const c: [number, number] = [0, 1]; // same as b — contributes 0
    const dist = routeDistance([a, b, c]);
    // Should equal distance from a to b only
    const distAB = routeDistance([a, b]);
    expect(dist).toBeCloseTo(distAB, 5);
  });

  it('does not throw for coordinates with longitude > 180 (antimeridian edge case)', () => {
    const coords: [number, number][] = [
      [181, 0],
      [182, 1],
    ];
    expect(() => routeDistance(coords)).not.toThrow();
  });

  it('does not throw for coordinates at pole (lat = 90)', () => {
    const coords: [number, number][] = [
      [0, 90],
      [180, 90],
    ];
    expect(() => routeDistance(coords)).not.toThrow();
  });
});

// ─── applyReorder ────────────────────────────────────────────────────────────

describe('applyReorder', () => {
  const acts = [
    makeActivity('a'),
    makeActivity('b'),
    makeActivity('c'),
    makeActivity('d'),
  ];

  it('reorders activities to match orderedIds', () => {
    const result = applyReorder(acts, ['c', 'a', 'd', 'b']);
    expect(result.map((a) => a.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('preserves the same activity objects (no cloning)', () => {
    const result = applyReorder(acts, ['b', 'a', 'c', 'd']);
    expect(result[0]).toBe(acts[1]); // 'b' is acts[1]
    expect(result[1]).toBe(acts[0]); // 'a' is acts[0]
  });

  it('throws when orderedIds contains an unknown ID', () => {
    expect(() => applyReorder(acts, ['a', 'b', 'x'])).toThrow(
      /ID "x" not found/,
    );
  });

  it('throws when orderedIds contains a duplicate ID', () => {
    expect(() => applyReorder(acts, ['a', 'b', 'a', 'c'])).toThrow(
      /duplicate ID "a"/,
    );
  });

  it('works correctly with a single activity', () => {
    const single = [makeActivity('z')];
    const result = applyReorder(single, ['z']);
    expect(result.map((a) => a.id)).toEqual(['z']);
  });

  it('works correctly with an empty activities array and empty orderedIds', () => {
    expect(applyReorder([], [])).toEqual([]);
  });
});
