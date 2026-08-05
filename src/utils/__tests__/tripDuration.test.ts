import { describe, it, expect } from 'vitest';
import {
  MAX_TRIP_DAYS,
  tripDayCount,
  exceedsMaxTripDays,
} from '../tripDuration';

describe('tripDayCount', () => {
  it('counts a single-day trip (start == end) as 1', () => {
    expect(tripDayCount('2025-03-14', '2025-03-14')).toBe(1);
  });

  it('counts inclusive days', () => {
    // 14th -> 27th inclusive = 14 days
    expect(tripDayCount('2025-03-14', '2025-03-27')).toBe(14);
  });

  it('counts a 15-day range', () => {
    expect(tripDayCount('2025-03-14', '2025-03-28')).toBe(15);
  });

  it('is not shifted by daylight-saving transitions', () => {
    // US DST spring-forward around 2025-03-09; range straddles it.
    expect(tripDayCount('2025-03-07', '2025-03-13')).toBe(7);
  });

  it('returns null for missing dates', () => {
    expect(tripDayCount(undefined, '2025-03-14')).toBeNull();
    expect(tripDayCount('2025-03-14', null)).toBeNull();
    expect(tripDayCount('', '')).toBeNull();
  });

  it('tolerates full ISO datetime strings', () => {
    expect(
      tripDayCount('2025-03-14T00:00:00.000Z', '2025-03-15T09:00:00.000Z'),
    ).toBe(2);
  });
});

describe('exceedsMaxTripDays', () => {
  it('allows exactly the maximum length', () => {
    // MAX_TRIP_DAYS inclusive days
    expect(exceedsMaxTripDays('2025-03-14', '2025-03-27')).toBe(false);
    expect(tripDayCount('2025-03-14', '2025-03-27')).toBe(MAX_TRIP_DAYS);
  });

  it('flags one day over the maximum', () => {
    expect(exceedsMaxTripDays('2025-03-14', '2025-03-28')).toBe(true);
  });

  it('allows a single-day trip', () => {
    expect(exceedsMaxTripDays('2025-03-14', '2025-03-14')).toBe(false);
  });

  it('does not flag a missing range', () => {
    expect(exceedsMaxTripDays('', '')).toBe(false);
    expect(exceedsMaxTripDays('2025-03-14', undefined)).toBe(false);
  });

  it('does not flag a reversed range (handled by other validation)', () => {
    expect(exceedsMaxTripDays('2025-03-14', '2025-03-10')).toBe(false);
  });
});
