/**
 * Vitest unit tests for haversineKm and totalRouteDistanceKm in src/services/mapbox.ts
 *
 * These are pure synchronous math functions — no mocks required.
 */

import { describe, it, expect } from 'vitest';
import { haversineKm, totalRouteDistanceKm } from './mapbox';

// ─── haversineKm ─────────────────────────────────────────────────────────────

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    const point: [number, number] = [139.6917, 35.6895];
    expect(haversineKm(point, point)).toBe(0);
  });

  it('calculates correct distance between Tokyo and Osaka (~395–405 km)', () => {
    const tokyo: [number, number] = [139.6917, 35.6895];
    const osaka: [number, number] = [135.5023, 34.6937];
    const dist = haversineKm(tokyo, osaka);
    expect(dist).toBeGreaterThan(390);
    expect(dist).toBeLessThan(410);
  });

  it('does not throw for coordinates at poles', () => {
    const northPole: [number, number] = [0, 90];
    const southPole: [number, number] = [0, -90];
    expect(() => haversineKm(northPole, southPole)).not.toThrow();
  });

  it('does not throw for longitude > 180 (antimeridian edge case)', () => {
    const a: [number, number] = [181, 0];
    const b: [number, number] = [182, 1];
    expect(() => haversineKm(a, b)).not.toThrow();
  });
});

// ─── totalRouteDistanceKm ─────────────────────────────────────────────────────

describe('totalRouteDistanceKm', () => {
  it('returns 0 for an empty array', () => {
    expect(totalRouteDistanceKm([])).toBe(0);
  });

  it('returns 0 for a single point', () => {
    expect(totalRouteDistanceKm([[139.77, 35.66]])).toBe(0);
  });

  it('returns 0 for two identical consecutive points', () => {
    const coord: [number, number] = [139.77, 35.66];
    expect(totalRouteDistanceKm([coord, coord])).toBe(0);
  });

  it('calculates correct distance between Tokyo and Osaka (~395–405 km)', () => {
    const tokyo: [number, number] = [139.6917, 35.6895];
    const osaka: [number, number] = [135.5023, 34.6937];
    const dist = totalRouteDistanceKm([tokyo, osaka]);
    expect(dist).toBeGreaterThan(390);
    expect(dist).toBeLessThan(410);
  });

  it('matches the sum of haversineKm segments for two known points', () => {
    const tokyo: [number, number] = [139.6917, 35.6895];
    const osaka: [number, number] = [135.5023, 34.6937];
    const segment = haversineKm(tokyo, osaka);
    const total = totalRouteDistanceKm([tokyo, osaka]);
    expect(total).toBeCloseTo(segment, 10);
  });

  it('does not throw for coordinates at poles', () => {
    const coords: [number, number][] = [
      [0, 90],
      [0, -90],
    ];
    expect(() => totalRouteDistanceKm(coords)).not.toThrow();
  });

  it('does not throw for longitude > 180 (antimeridian edge case)', () => {
    const coords: [number, number][] = [
      [181, 0],
      [182, 1],
    ];
    expect(() => totalRouteDistanceKm(coords)).not.toThrow();
  });

  it('calculates correct total for multiple segments', () => {
    // A(0,0) → B(0,1) → C(0,2): each ≈ 111.19 km, total ≈ 222.38 km
    const coords: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    const dist = totalRouteDistanceKm(coords);
    expect(dist).toBeGreaterThan(220);
    expect(dist).toBeLessThan(230);
  });
});
