import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedDemoDataIfNeeded, SEEDED_FLAG, DEMO_PLAN_ID } from '../seed';
import { db } from '../index';
import { useAppStore } from '../../store';

// db is mocked globally in src/test/setup.ts. We drive the plans.filter().count()
// path per-test to simulate "no plans" vs "existing plans".

function mockPlanCount(count: number) {
  vi.mocked(db.plans.filter).mockReturnValue({
    count: vi.fn().mockResolvedValue(count),
    // sortBy is present on the real chainable object; unused here.
    sortBy: vi.fn().mockResolvedValue([]),
  } as unknown as ReturnType<typeof db.plans.filter>);
}

describe('seedDemoDataIfNeeded', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('seeds a demo plan, todos and clipboard on first launch (no plans, no flag)', async () => {
    mockPlanCount(0);
    const id = await seedDemoDataIfNeeded();

    expect(id).toBeTruthy();
    expect(db.plans.add).toHaveBeenCalledTimes(1);

    const addedPlan = vi.mocked(db.plans.add).mock.calls[0][0];
    expect(addedPlan.destination).toBe('Tokyo, Japan');
    expect(addedPlan.name).toBe('Tokyo Explorer');
    expect(addedPlan.deleted).toBe(false);
    expect(addedPlan.itinerary).toHaveLength(3);
    // Day activity counts: 4, 4, 3
    expect(addedPlan.itinerary[0].activities).toHaveLength(4);
    expect(addedPlan.itinerary[1].activities).toHaveLength(4);
    expect(addedPlan.itinerary[2].activities).toHaveLength(3);
    // Intake matches the spec
    expect(addedPlan.intake?.numTravellers).toBe(2);
    expect(addedPlan.intake?.budgetRange).toBe('mid');

    // 3 todos, 1 clipboard item written
    const todos = vi.mocked(db.todos.bulkAdd).mock.calls[0][0];
    expect(todos).toHaveLength(3);
    const clip = vi.mocked(db.clipboard.bulkAdd).mock.calls[0][0];
    expect(clip).toHaveLength(1);
    expect(clip[0].title).toBe('Hotel — Shinjuku Grand');
    expect(clip[0].linkedDayIndex).toBe(0);

    // Flags set
    expect(localStorage.getItem(SEEDED_FLAG)).toBe('true');
    expect(localStorage.getItem(DEMO_PLAN_ID)).toBe(id);

    // Active plan set in the store
    expect(useAppStore.getState().activePlanId).toBe(id);
  });

  it('does not seed when the aitp_seeded flag is already set', async () => {
    localStorage.setItem(SEEDED_FLAG, 'true');
    mockPlanCount(0);
    const id = await seedDemoDataIfNeeded();
    expect(id).toBeNull();
    expect(db.plans.add).not.toHaveBeenCalled();
  });

  it('does not seed when plans already exist, but sets the flag', async () => {
    mockPlanCount(2);
    const id = await seedDemoDataIfNeeded();
    expect(id).toBeNull();
    expect(db.plans.add).not.toHaveBeenCalled();
    expect(localStorage.getItem(SEEDED_FLAG)).toBe('true');
  });

  it('swallows IndexedDB errors and never throws', async () => {
    mockPlanCount(0);
    vi.mocked(db.plans.add).mockRejectedValueOnce(new Error('QuotaExceeded'));
    const id = await seedDemoDataIfNeeded();
    expect(id).toBeNull();
  });
});
