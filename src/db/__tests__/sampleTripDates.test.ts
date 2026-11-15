import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sampleTripDates, keepSampleTripAhead, seedDemoDataIfNeeded, upgradeSampleTrip, SEEDED_FLAG, DEMO_PLAN_ID } from '../seed';
import { db, type Plan } from '../index';
import { isBeyondForecast } from '../../services/weather';

const plan = (startDate: string, endDate = startDate) => ({ id: 'demo', startDate, endDate, deleted: false }) as Plan;
const NOW = new Date(2026, 10, 15);

describe('sample trip dates', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts a week from today, in local time, and runs four days', () => {
    // Late evening local time: a UTC-based date could already be tomorrow.
    expect(sampleTripDates(new Date(2026, 10, 15, 23, 30))).toEqual({
      startDate: '2026-11-22',
      endDate: '2026-11-25',
    });
  });

  it('sits inside the live forecast, every day of it', () => {
    const { startDate, endDate } = sampleTripDates(NOW);
    expect(isBeyondForecast(startDate, NOW)).toBe(false);
    expect(isBeyondForecast(endDate, NOW)).toBe(false);
  });

  it('crosses month and year ends', () => {
    expect(sampleTripDates(new Date(2026, 11, 28))).toEqual({ startDate: '2027-01-04', endDate: '2027-01-07' });
  });

  it('leaves a sample trip that is ahead and inside the forecast alone', async () => {
    for (const [start, end] of [['2026-11-16', '2026-11-18'], ['2026-11-26', '2026-11-28']]) {
      expect(await keepSampleTripAhead(plan(start, end), NOW)).toBe(false);
    }
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  it('moves one that has started, passed, or sits past the forecast back to a week out', async () => {
    const cases: [string, string][] = [
      ['2026-11-15', '2026-11-17'], // starts today
      ['2026-10-01', '2026-10-03'], // over
      ['2026-12-06', '2026-12-08'], // three weeks out, past the forecast
      ['2026-11-27', '2026-11-29'], // ends past the forecast
    ];
    for (const [start, end] of cases) {
      vi.mocked(db.plans.update).mockClear();
      expect(await keepSampleTripAhead(plan(start, end), NOW)).toBe(true);
      expect(db.plans.update).toHaveBeenCalledWith(
        'demo',
        expect.objectContaining({ startDate: '2026-11-22', endDate: '2026-11-25' }),
      );
    }
  });

  it('refreshes the sample trip on boot after the first launch', async () => {
    localStorage.setItem(SEEDED_FLAG, 'true');
    localStorage.setItem(DEMO_PLAN_ID, 'demo');
    vi.mocked(db.plans.get).mockResolvedValueOnce(plan('2020-01-01') as never);
    await seedDemoDataIfNeeded();
    expect(db.plans.update).toHaveBeenCalledWith('demo', expect.objectContaining(sampleTripDates()));
  });
});

describe('upgrading an older sample trip', () => {
  const nikkoDay = {
    dayIndex: 2, label: 'Day 3 — Day Trip',
    activities: ['Nikko Tosho-gu Shrine', 'Kegon Falls', 'Return to Tokyo'].map((name) => ({ id: name, name, time: '09:00' })),
  };
  const old = (day3: object) => ({ id: 'demo', startDate: '2026-11-22', endDate: '2026-11-24', itinerary: [{ dayIndex: 0, activities: [] }, { dayIndex: 1, activities: [] }, day3] }) as unknown as Plan;

  beforeEach(() => vi.clearAllMocks());

  it('turns the untouched three-day sample into four: indoor Day 3, departure Day 4', async () => {
    expect(await upgradeSampleTrip(old(nikkoDay))).toBe(true);
    const { itinerary, endDate } = vi.mocked(db.plans.update).mock.calls[0][1] as Plan;
    expect(itinerary.map((d) => d.label)).toEqual([undefined, undefined, 'Day 3 — Museums & Arcades', 'Day 4 — Departure']);
    expect(itinerary[2].activities.map((a) => a.name)).toContain('teamLab Planets');
    expect(endDate).toBe('2026-11-25');
  });

  it('leaves a Day 3 the visitor has changed alone', async () => {
    const edited = { ...nikkoDay, activities: nikkoDay.activities.slice(0, 2) };
    expect(await upgradeSampleTrip(old(edited))).toBe(false);
    expect(db.plans.update).not.toHaveBeenCalled();
  });
});
