import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AGENT_TOOLS, executeAgentAction, buildSystemPrompt } from '../agentActions';
import { db, type Plan } from '../../../db';

const plan: Plan = {
  id: 'p1', name: 'Percé', destination: 'Percé', country: 'Canada',
  startDate: '2025-08-01', endDate: '2025-08-08',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [{ dayIndex: 0, label: 'Day 1', activities: [] }],
};

const written = () => vi.mocked(db.plans.update).mock.calls.slice(-1)[0][1] as Partial<Plan>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(db.plans, 'update').mockResolvedValue(1);
});

/*
 * Telling the assistant "we're driving up from Montreal" used to do nothing
 * it could keep: it had no tool that touched the trip's shape, so at best it
 * added an activity, and the next generated itinerary still began at Percé.
 */
describe('recording where the trip starts', () => {
  it('offers a tool for it at all', () => {
    const names = AGENT_TOOLS.map(t => t.function.name);
    expect(names).toContain('set_travel_leg');
    expect(names).toContain('set_trip_stops');
  });

  it('records the city and mode they set off with', async () => {
    const out = await executeAgentAction(plan, {
      id: '1', name: 'set_travel_leg',
      args: { which: 'arrival', city: 'Montreal', mode: 'car' },
    });
    expect(out.ok).toBe(true);
    expect(written().arrival).toEqual({ city: 'Montreal', mode: 'car' });
  });

  // Told the mode now and the city later, the second answer must not erase
  // the first.
  it('merges into what was already known', async () => {
    await executeAgentAction({ ...plan, arrival: { mode: 'car' } }, {
      id: '1', name: 'set_travel_leg', args: { which: 'arrival', city: 'Montreal' },
    });
    expect(written().arrival).toEqual({ mode: 'car', city: 'Montreal' });
  });

  it('records the return leg separately', async () => {
    await executeAgentAction(plan, {
      id: '1', name: 'set_travel_leg',
      args: { which: 'departure', city: 'Montreal', date: '2025-08-08' },
    });
    expect(written().departure).toEqual({ city: 'Montreal', date: '2025-08-08' });
  });

  it('asks again rather than writing nothing useful', async () => {
    const out = await executeAgentAction(plan, { id: '1', name: 'set_travel_leg', args: { which: 'arrival' } });
    expect(out.ok).toBe(false);
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  // The itinerary is only regenerated on request, so saying so avoids the
  // user assuming the change has already taken effect.
  it('says the itinerary needs regenerating', async () => {
    const out = await executeAgentAction(plan, {
      id: '1', name: 'set_travel_leg', args: { which: 'arrival', city: 'Montreal', mode: 'car' },
    });
    expect(out.message).toMatch(/regenerate/i);
  });
});

describe('correcting the route', () => {
  it('sets the cities in the order given', async () => {
    const out = await executeAgentAction(plan, {
      id: '1', name: 'set_trip_stops',
      args: { stops: [{ city: 'Matane', nights: 1 }, { city: 'Rimouski' }, { city: 'Percé', nights: 3 }] },
    });
    expect(out.ok).toBe(true);
    expect(written().stops?.map(s => s.city)).toEqual(['Matane', 'Rimouski', 'Percé']);
    expect(written().stops?.[0].nights).toBe(1);
  });

  it('reads the whole route back, so a wrong order is visible immediately', async () => {
    const out = await executeAgentAction({ ...plan, arrival: { city: 'Montreal', mode: 'car' } }, {
      id: '1', name: 'set_trip_stops',
      args: { stops: [{ city: 'Matane' }, { city: 'Percé' }] },
    });
    expect(out.message).toContain('Montreal → Matane → Percé');
  });

  it('ignores rows with no city rather than storing blanks', async () => {
    await executeAgentAction(plan, {
      id: '1', name: 'set_trip_stops', args: { stops: [{ city: 'Matane' }, { city: '  ' }] },
    });
    expect(written().stops).toHaveLength(1);
  });

  it('asks again when it caught no names', async () => {
    const out = await executeAgentAction(plan, { id: '1', name: 'set_trip_stops', args: { stops: [] } });
    expect(out.ok).toBe(false);
    expect(db.plans.update).not.toHaveBeenCalled();
  });
});

describe('what the assistant is told about the journey', () => {
  it('knows the route it is meant to respect', () => {
    const out = buildSystemPrompt({
      ...plan,
      arrival: { city: 'Montreal', mode: 'car' },
      departure: { city: 'Montreal', mode: 'car' },
      stops: [{ id: '1', city: 'Matane' }, { id: '2', city: 'Percé' }],
    }, 'itinerary');
    expect(out).toContain('Montreal → Matane → Percé → Montreal');
    expect(out).toContain('Getting there: Car · Montreal');
  });

  // Otherwise it answers as though the trip already knows, and the user has
  // no idea the setting exists.
  it('says when nobody has recorded it, and what to do about that', () => {
    const out = buildSystemPrompt(plan, 'itinerary');
    expect(out).toMatch(/not recorded/i);
    expect(out).toContain('set_travel_leg');
  });
});

/*
 * The itinerary draws attachments by activity, so they follow it on screen
 * either way — but the clipboard shows "linked to Day 2" from the stored
 * index, and left alone it would go on naming the day the activity used to
 * be on.
 */
describe('moving an activity that has confirmations attached', () => {
  const twoDays: Plan = {
    ...plan,
    itinerary: [
      { dayIndex: 0, label: 'Day 1', activities: [{ id: 'a1', name: 'Auberge check-in', time: 'evening', locationName: '', notes: '', pinnedToTodo: false }] },
      { dayIndex: 1, label: 'Day 2', activities: [] },
    ],
  };

  it('takes them to the new day', async () => {
    vi.spyOn(db.clipboard, 'where').mockReturnValue({
      equals: () => ({ toArray: async () => [
        { id: 'c1', planId: 'p1', type: 'Hotel', title: 'Booking', linkedActivityId: 'a1', linkedDayIndex: 0, createdAt: '', updatedAt: '' },
      ] }),
    } as never);
    const update = vi.spyOn(db.clipboard, 'update').mockResolvedValue(1);

    await executeAgentAction(twoDays, {
      id: '1', name: 'move_activity', args: { nameMatch: 'auberge', toDayIndex: 1 },
    });

    expect(update).toHaveBeenCalledWith('c1', expect.objectContaining({ linkedDayIndex: 1 }));
  });

  it('leaves them alone when the activity only changes time', async () => {
    const update = vi.spyOn(db.clipboard, 'update').mockResolvedValue(1);
    await executeAgentAction(twoDays, {
      id: '1', name: 'move_activity', args: { nameMatch: 'auberge', time: 'night' },
    });
    expect(update).not.toHaveBeenCalled();
  });
});
