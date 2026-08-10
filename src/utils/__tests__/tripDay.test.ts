import { describe, it, expect } from 'vitest';
import { todayDayIndex, tripTiming, dateForDayIndex, relativeDayLabel } from '../tripDay';

const trip = { startDate: '2025-08-01', endDate: '2025-08-05' };
/** A local-time Date, the way a device reports the traveller's own day. */
const on = (iso: string, hour = 12) => new Date(`${iso}T${String(hour).padStart(2, '0')}:00:00`);

describe('which day of the trip today is', () => {
  it('counts from the start date', () => {
    expect(todayDayIndex(trip, on('2025-08-01'))).toBe(0);
    expect(todayDayIndex(trip, on('2025-08-03'))).toBe(2);
    expect(todayDayIndex(trip, on('2025-08-05'))).toBe(4);
  });

  it('is nothing before the trip and after it', () => {
    expect(todayDayIndex(trip, on('2025-07-31'))).toBeNull();
    expect(todayDayIndex(trip, on('2025-08-06'))).toBeNull();
  });

  /*
   * The day must not shift with the clock. Comparing local timestamps against
   * a UTC-parsed start date moves the boundary by the device's offset, so a
   * traveller late on day three would be shown day four.
   */
  it('holds at both ends of the day', () => {
    expect(todayDayIndex(trip, on('2025-08-03', 0))).toBe(2);
    expect(todayDayIndex(trip, on('2025-08-03', 23))).toBe(2);
  });

  it('still knows day one when the end date is unusable', () => {
    expect(todayDayIndex({ startDate: '2025-08-01', endDate: '' }, on('2025-08-01'))).toBe(0);
  });
});

describe('where a trip is in its own timeline', () => {
  it('counts down to one that has not started', () => {
    const t = tripTiming(trip, on('2025-07-29'));
    expect(t.status).toBe('upcoming');
    expect(t.daysUntil).toBe(3);
  });

  it('knows a trip is running, and how much is left', () => {
    const t = tripTiming(trip, on('2025-08-03'));
    expect(t.status).toBe('active');
    expect(t.todayIndex).toBe(2);
    expect(t.daysRemaining).toBe(3); // the 3rd, 4th and 5th
  });

  it('counts the last day as one day remaining, not none', () => {
    expect(tripTiming(trip, on('2025-08-05')).daysRemaining).toBe(1);
  });

  it('knows a trip is over', () => {
    expect(tripTiming(trip, on('2025-08-06')).status).toBe('past');
  });

  it('admits when the dates say nothing', () => {
    expect(tripTiming({ startDate: '', endDate: '' }).status).toBe('unknown');
  });
});

describe('dateForDayIndex', () => {
  it('walks forward a day at a time', () => {
    expect(dateForDayIndex('2025-08-01', 0)).toBe('2025-08-01');
    expect(dateForDayIndex('2025-08-01', 4)).toBe('2025-08-05');
  });

  // A month boundary is where naive date arithmetic gives up.
  it('crosses a month end', () => {
    expect(dateForDayIndex('2025-07-30', 3)).toBe('2025-08-02');
  });

  it('has nothing to say about an unparseable date', () => {
    expect(dateForDayIndex('not a date', 0)).toBeNull();
  });
});

describe('relativeDayLabel', () => {
  it('names the days worth naming', () => {
    expect(relativeDayLabel('2025-08-01', 2, on('2025-08-03'))).toBe('Today');
    expect(relativeDayLabel('2025-08-01', 3, on('2025-08-03'))).toBe('Tomorrow');
    expect(relativeDayLabel('2025-08-01', 1, on('2025-08-03'))).toBe('Yesterday');
  });

  // "In 4 days" on every other row is noise, not information.
  it('says nothing about the rest', () => {
    expect(relativeDayLabel('2025-08-01', 4, on('2025-08-01'))).toBeNull();
  });
});
