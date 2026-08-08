import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoGenerateTodos } from '../generateTodos';
import { db, type Plan } from '../../../db';

const basePlan: Plan = {
  id: 'p1', name: 'Trip', destination: 'Toronto', country: 'Canada',
  startDate: '2025-07-14', endDate: '2025-07-18',
  createdAt: '', updatedAt: '', deleted: false, itinerary: [],
  intake: {
    numTravellers: 2, kids: false, kidAges: null, likes: [], dislikes: [],
    budgetRange: 'mid', flightsBooked: false, accommodationBooked: true,
    needsVisa: null,
  },
};

const titles = () => {
  const call = vi.mocked(db.todos.bulkAdd).mock.calls[0];
  return ((call?.[0] ?? []) as Array<{ title: string }>).map(t => t.title);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(db.todos, 'where').mockReturnValue({
    equals: () => ({ toArray: async () => [] }),
  } as unknown as ReturnType<typeof db.todos.where>);
  vi.spyOn(db.todos, 'bulkAdd').mockResolvedValue('x' as never);
});

describe('travel that is not a flight', () => {
  it('asks for train tickets on a train trip', async () => {
    await autoGenerateTodos({ ...basePlan, arrival: { mode: 'train' } });
    expect(titles()).toContain('Book train tickets to Toronto');
  });

  // A road trip has no ticket to buy, and a task saying otherwise is noise.
  it('asks for nothing to be booked on a road trip', async () => {
    await autoGenerateTodos({ ...basePlan, arrival: { mode: 'car' } });
    expect(titles().some(t => t.startsWith('Book'))).toBe(false);
  });
});

describe('entry requirements follow the border, not the mode', () => {
  /*
   * The assumption being removed: every trip used to produce a visa task. A
   * drive to the next town over needs none, and nothing else in the app can
   * work that out — the app never learns where the traveller lives.
   */
  it('raises nothing at all for a domestic trip', async () => {
    await autoGenerateTodos({ ...basePlan, international: false, arrival: { mode: 'car' } });
    expect(titles().some(t => /visa|entry/i.test(t))).toBe(false);
  });

  it('still asks on a domestic-looking trip nobody has classified', async () => {
    await autoGenerateTodos({ ...basePlan, arrival: { mode: 'car' } });
    expect(titles()).toContain('Check visa requirements for Canada');
  });

  // Three countries is three sets of rules, not one.
  it('asks about every country a multi-city trip touches', async () => {
    await autoGenerateTodos({
      ...basePlan,
      destination: 'Paris', country: 'France',
      international: true,
      arrival: { mode: 'train' },
      stops: [
        { id: '1', city: 'Geneva', country: 'Switzerland' },
        { id: '2', city: 'Turin', country: 'Italy' },
      ],
    });
    const out = titles();
    expect(out).toContain('Check visa requirements for France');
    expect(out).toContain('Check visa requirements for Switzerland');
    expect(out).toContain('Check visa requirements for Italy');
  });

  it('asks once per country however many cities are in it', async () => {
    await autoGenerateTodos({
      ...basePlan,
      destination: 'Tokyo', country: 'Japan', international: true,
      stops: [
        { id: '1', city: 'Kyoto', country: 'Japan' },
        { id: '2', city: 'Osaka', country: 'Japan' },
      ],
    });
    expect(titles().filter(t => t.includes('visa requirements'))).toHaveLength(1);
  });

  it('drops child entry checks on a domestic trip too', async () => {
    await autoGenerateTodos({
      ...basePlan,
      international: false,
      intake: { ...basePlan.intake!, kids: true },
    });
    expect(titles().some(t => t.includes('child entry'))).toBe(false);
  });
});
