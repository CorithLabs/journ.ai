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

  it('remove_activity deletes the matching activity', async () => {
    vi.mocked(db.plans.update).mockResolvedValue(1);
    const res = await executeAgentAction(plan, {
      name: 'remove_activity',
      args: { nameMatch: 'museum' },
    });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/removed "Museum"/i);
    // Day 2's activities should no longer contain the Museum.
    const written = vi.mocked(db.plans.update).mock.calls[0][1] as { itinerary: typeof plan.itinerary };
    const day2 = written.itinerary.find((d) => d.dayIndex === 1)!;
    expect(day2.activities).toHaveLength(0);
  });

  it('edit_activity replaces one activity with another, keeping its time slot', async () => {
    vi.mocked(db.plans.update).mockResolvedValue(1);
    const res = await executeAgentAction(plan, {
      name: 'edit_activity',
      args: { nameMatch: 'museum', newName: 'Aquarium', locationName: 'Sumida Aquarium' },
    });
    expect(res.ok).toBe(true);
    const written = vi.mocked(db.plans.update).mock.calls[0][1] as { itinerary: typeof plan.itinerary };
    const act = written.itinerary.find((d) => d.dayIndex === 1)!.activities[0];
    expect(act.name).toBe('Aquarium');
    expect(act.locationName).toBe('Sumida Aquarium');
    expect(act.time).toBe('10:00'); // slot preserved
  });

  it('remove_activity / edit_activity report when nothing matches', async () => {
    const r1 = await executeAgentAction(plan, { name: 'remove_activity', args: { nameMatch: 'nope' } });
    const r2 = await executeAgentAction(plan, { name: 'edit_activity', args: { nameMatch: 'nope', newName: 'X' } });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  /** Stub db.todos.where('planId').equals(id).toArray() with a fixed list. */
  const mockTodos = (rows: unknown[]) =>
    vi.mocked(db.todos.where).mockReturnValue({
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue(rows),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

  describe('move_activity', () => {
    it('moves an activity to another day, preserving its other fields', async () => {
      vi.mocked(db.plans.update).mockResolvedValue(1);
      const res = await executeAgentAction(plan, {
        name: 'move_activity',
        args: { nameMatch: 'museum', toDayIndex: 0 },
      });
      expect(res.ok).toBe(true);
      expect(res.message).toMatch(/Day 1/);
      const written = vi.mocked(db.plans.update).mock.calls.at(-1)![1] as {
        itinerary: { dayIndex: number; activities: { id: string; name: string }[] }[];
      };
      // Present on the destination day, gone from the source — not duplicated.
      expect(written.itinerary.find((d) => d.dayIndex === 0)!.activities).toHaveLength(1);
      expect(written.itinerary.find((d) => d.dayIndex === 1)!.activities).toHaveLength(0);
      expect(written.itinerary[0].activities[0].id).toBe('a1');
    });

    it('changes only the time when no destination day is given', async () => {
      vi.mocked(db.plans.update).mockResolvedValue(1);
      const res = await executeAgentAction(plan, {
        name: 'move_activity',
        args: { nameMatch: 'museum', time: '15:30' },
      });
      expect(res.ok).toBe(true);
      const written = vi.mocked(db.plans.update).mock.calls.at(-1)![1] as {
        itinerary: { dayIndex: number; activities: { time: string }[] }[];
      };
      const day2 = written.itinerary.find((d) => d.dayIndex === 1)!;
      expect(day2.activities).toHaveLength(1);
      expect(day2.activities[0].time).toBe('15:30');
    });

    it('rejects a destination day that does not exist', async () => {
      const res = await executeAgentAction(plan, {
        name: 'move_activity',
        args: { nameMatch: 'museum', toDayIndex: 9 },
      });
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/no Day 10/);
      expect(db.plans.update).not.toHaveBeenCalled();
    });

    it('asks where to move it when neither day nor time is given', async () => {
      const res = await executeAgentAction(plan, {
        name: 'move_activity',
        args: { nameMatch: 'museum' },
      });
      expect(res.ok).toBe(false);
      expect(db.plans.update).not.toHaveBeenCalled();
    });
  });

  describe('add_todo', () => {
    it('creates a task with the given category', async () => {
      vi.mocked(db.todos.add).mockResolvedValue('t-new');
      const res = await executeAgentAction(plan, {
        name: 'add_todo',
        args: { title: 'Book the train to Kyoto', category: 'Booking' },
      });
      expect(res.ok).toBe(true);
      expect(db.todos.add).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plan-1',
          title: 'Book the train to Kyoto',
          category: 'Booking',
          status: 'todo',
          autoGenerated: false,
        }),
      );
    });

    it('falls back to Other for an unrecognised category', async () => {
      vi.mocked(db.todos.add).mockResolvedValue('t-new');
      await executeAgentAction(plan, {
        name: 'add_todo',
        args: { title: 'Something', category: 'Nonsense' },
      });
      expect(db.todos.add).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Other' }),
      );
    });

    it('refuses an empty title', async () => {
      const res = await executeAgentAction(plan, { name: 'add_todo', args: { title: '  ' } });
      expect(res.ok).toBe(false);
      expect(db.todos.add).not.toHaveBeenCalled();
    });
  });

  it('reopen_todo sets a completed task back to todo', async () => {
    mockTodos([{ id: 't1', planId: 'plan-1', title: 'Book flights', status: 'done' }]);
    vi.mocked(db.todos.update).mockResolvedValue(1);
    const res = await executeAgentAction(plan, {
      name: 'reopen_todo',
      args: { titleMatch: 'flights' },
    });
    expect(res.ok).toBe(true);
    expect(db.todos.update).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'todo' }));
  });

  describe('pin_activity_to_todo', () => {
    it('creates a linked task and flags the activity as pinned', async () => {
      mockTodos([]);
      vi.mocked(db.todos.add).mockResolvedValue('t-new');
      vi.mocked(db.plans.update).mockResolvedValue(1);
      const res = await executeAgentAction(plan, {
        name: 'pin_activity_to_todo',
        args: { nameMatch: 'museum' },
      });
      expect(res.ok).toBe(true);
      expect(db.todos.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Museum', sourceActivityId: 'a1', sourceDayIndex: 1 }),
      );
      const written = vi.mocked(db.plans.update).mock.calls.at(-1)![1] as {
        itinerary: { dayIndex: number; activities: { pinnedToTodo: boolean }[] }[];
      };
      expect(written.itinerary.find((d) => d.dayIndex === 1)!.activities[0].pinnedToTodo).toBe(true);
    });

    it('does not create a second task for an already-pinned activity', async () => {
      mockTodos([{ id: 't1', planId: 'plan-1', title: 'Museum', sourceActivityId: 'a1' }]);
      const res = await executeAgentAction(plan, {
        name: 'pin_activity_to_todo',
        args: { nameMatch: 'museum' },
      });
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/already/i);
      expect(db.todos.add).not.toHaveBeenCalled();
    });
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

  // The loop is single-shot, so anything the model must ANSWER from has to be
  // in the prompt — a read tool's result would never reach it.
  it('summarises to-dos and clipboard so the model can answer without a tool', () => {
    const prompt = buildSystemPrompt(plan, 'todo', {
      todos: [
        {
          id: 't1', planId: 'plan-1', title: 'Book flights', category: 'Booking',
          status: 'done', autoGenerated: true, createdAt: '', updatedAt: '',
        },
        {
          id: 't2', planId: 'plan-1', title: 'Get travel insurance', category: 'Document',
          status: 'todo', autoGenerated: false, createdAt: '', updatedAt: '',
        },
      ],
      clipboard: [
        {
          id: 'c1', planId: 'plan-1', type: 'Hotel', title: 'Shinjuku Grand',
          createdAt: '', updatedAt: '',
        },
      ],
    });
    expect(prompt).toMatch(/\[x\] Book flights/);
    expect(prompt).toMatch(/\[ \] Get travel insurance/);
    expect(prompt).toMatch(/Shinjuku Grand \(Hotel\)/);
  });

  it('degrades to placeholders when there are no to-dos or clipboard items', () => {
    const prompt = buildSystemPrompt(plan, 'itinerary');
    expect(prompt).toMatch(/no tasks yet/);
    expect(prompt).toMatch(/nothing saved yet/);
  });
});
