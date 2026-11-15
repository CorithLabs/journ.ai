import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sampleTripDates, keepSampleTripAhead, seedDemoDataIfNeeded, SEEDED_FLAG, DEMO_PLAN_ID } from '../seed';
import { db, type Plan } from '../index';

const plan = (startDate: string) => ({ id: 'demo', startDate, endDate: startDate, deleted: false }) as Plan;

describe('sample trip dates', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts three weeks from today, in local time, and runs three days', () => {
    // Late evening local time: a UTC-based date could already be tomorrow.
    expect(sampleTripDates(new Date(2026, 10, 15, 23, 30))).toEqual({
      startDate: '2026-12-06',
      endDate: '2026-12-08',
    });
  });

  it('crosses month and year ends', () => {
    expect(sampleTripDates(new Date(2026, 11, 20))).toEqual({ startDate: '2027-01-10', endDate: '2027-01-12' });
  });

  it('leaves a sample trip that is still ahead alone', async () => {
    const now = new Date(2026, 10, 15);
    expect(await keepSampleTripAhead(plan('2026-11-16'), now)).toBe(false);
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  it('moves one that starts today, or has passed, back to three weeks out', async () => {
    const now = new Date(2026, 10, 15);
    for (const start of ['2026-11-15', '2026-10-01']) {
      vi.mocked(db.plans.update).mockClear();
      expect(await keepSampleTripAhead(plan(start), now)).toBe(true);
      expect(db.plans.update).toHaveBeenCalledWith(
        'demo',
        expect.objectContaining({ startDate: '2026-12-06', endDate: '2026-12-08' }),
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
