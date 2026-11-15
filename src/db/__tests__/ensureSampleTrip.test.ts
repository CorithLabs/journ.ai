import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSampleTrip, DEMO_PLAN_ID } from '../seed';
import { db } from '../index';

describe('ensureSampleTrip (/demo)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('opens the sample trip already in this browser', async () => {
    localStorage.setItem(DEMO_PLAN_ID, 'existing-id');
    vi.mocked(db.plans.get).mockResolvedValueOnce({ id: 'existing-id', deleted: false } as never);
    expect(await ensureSampleTrip()).toBe('existing-id');
    expect(db.plans.add).not.toHaveBeenCalled();
  });

  it('adds a fresh copy when the sample was deleted', async () => {
    localStorage.setItem(DEMO_PLAN_ID, 'old-id');
    vi.mocked(db.plans.get).mockResolvedValueOnce({ id: 'old-id', deleted: true } as never);
    const id = await ensureSampleTrip();
    expect(id).not.toBe('old-id');
    expect(db.plans.add).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DEMO_PLAN_ID)).toBe(id);
  });

  it('adds one when there never was a sample', async () => {
    const id = await ensureSampleTrip();
    expect(id).toBeTruthy();
    expect(db.plans.add).toHaveBeenCalledTimes(1);
  });
});
