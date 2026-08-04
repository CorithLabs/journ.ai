import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentAction, buildSystemPrompt } from '../agentActions';
import { db, type Plan } from '../../../db';

const plan: Plan = {
  id: 'plan-1',
  name: 'Tokyo',
  destination: 'Tokyo',
  startDate: '2025-07-14',
  endDate: '2025-07-16',
  createdAt: '',
  updatedAt: '',
  deleted: false,
  itinerary: [
    { dayIndex: 0, label: 'Day 1', activities: [] },
    {
      dayIndex: 1,
      label: 'Day 2',
      activities: [
        { id: 'a1', name: 'Museum', time: '10:00', locationName: '', notes: '', pinnedToTodo: false },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeAgentAction', () => {
  it('add_activity appends an activity to the right day and persists', async () => {
    vi.mocked(db.plans.update).mockResolvedValue(1);
    const res = await executeAgentAction(plan, {
      name: 'add_activity',
      args: { dayIndex: 0, name: 'Tsukiji Market', time: '08:00' },
    });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Tsukiji Market/);
    expect(res.message).toMatch(/Day 1/);
    expect(db.plans.update).toHaveBeenCalledWith(
      'plan-1',
      expect.objectContaining({
        itinerary: expect.arrayContaining([
          expect.objectContaining({
            dayIndex: 0,
            activities: expect.arrayContaining([
              expect.objectContaining({ name: 'Tsukiji Market', time: '08:00' }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('add_activity rejects a non-existent day', async () => {
    const res = await executeAgentAction(plan, {
      name: 'add_activity',
      args: { dayIndex: 9, name: 'X' },
    });
    expect(res.ok).toBe(false);
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  it('complete_todo marks a matching task done', async () => {
    vi.mocked(db.todos.where).mockReturnValue({
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([
        { id: 't1', planId: 'plan-1', title: 'Book flights to Tokyo', status: 'todo' },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(db.todos.update).mockResolvedValue(1);
    const res = await executeAgentAction(plan, {
      name: 'complete_todo',
      args: { titleMatch: 'flights' },
    });
    expect(res.ok).toBe(true);
    expect(db.todos.update).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'done' }));
  });

  it('complete_todo reports when no task matches', async () => {
    vi.mocked(db.todos.where).mockReturnValue({
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await executeAgentAction(plan, {
      name: 'complete_todo',
      args: { titleMatch: 'nope' },
    });
    expect(res.ok).toBe(false);
    expect(db.todos.update).not.toHaveBeenCalled();
  });

  it('save_clipboard adds a clipboard note', async () => {
    vi.mocked(db.clipboard.add).mockResolvedValue('c1');
    const res = await executeAgentAction(plan, {
      name: 'save_clipboard',
      args: { type: 'Hotel', title: 'Confirmation', body: '#ABC123' },
    });
    expect(res.ok).toBe(true);
    expect(db.clipboard.add).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'plan-1', type: 'Hotel', title: 'Confirmation', body: '#ABC123' }),
    );
  });

  it('returns a friendly error for an unknown action', async () => {
    const res = await executeAgentAction(plan, { name: 'delete_universe', args: {} });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/couldn't complete/i);
  });
});

describe('buildSystemPrompt', () => {
  it('includes destination, active tab, and an itinerary summary', () => {
    const prompt = buildSystemPrompt(plan, 'itinerary');
    expect(prompt).toMatch(/Tokyo/);
    expect(prompt).toMatch(/Active tab: itinerary/);
    expect(prompt).toMatch(/Museum/);
  });
});
