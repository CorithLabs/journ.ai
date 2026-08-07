import { describe, it, expect } from 'vitest';
import { scaffoldDays } from '../scaffoldDays';
import { MAX_TRIP_DAYS } from '../tripDuration';

describe('scaffoldDays', () => {
  it('creates one empty day per date, counting both ends', () => {
    const days = scaffoldDays('2025-07-14', '2025-07-16');
    expect(days).toHaveLength(3);
    expect(days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
    expect(days.every((d) => d.activities.length === 0)).toBe(true);
  });

  // Same shape the AI is asked to produce, so a hand-started itinerary is
  // indistinguishable downstream.
  it('labels days like the generated ones', () => {
    const [first] = scaffoldDays('2025-07-14', '2025-07-15');
    expect(first.label).toBe('Day 1 — Mon 14 Jul');
  });

  it('rolls the label into the next month correctly', () => {
    const days = scaffoldDays('2025-07-30', '2025-08-01');
    expect(days[2].label).toBe('Day 3 — Fri 1 Aug');
  });

  it('never exceeds the trip cap', () => {
    expect(scaffoldDays('2025-01-01', '2025-12-31')).toHaveLength(MAX_TRIP_DAYS);
  });

  it('produces a single usable day for a same-day trip', () => {
    expect(scaffoldDays('2025-07-14', '2025-07-14')).toHaveLength(1);
  });

  // Better to start with one day the user can extend than to refuse entirely.
  it('falls back to one day when the range is missing or reversed', () => {
    expect(scaffoldDays('', '')).toHaveLength(1);
    expect(scaffoldDays('2025-07-16', '2025-07-14')).toHaveLength(1);
    expect(scaffoldDays('nonsense', 'also-nonsense')).toHaveLength(1);
  });
});
