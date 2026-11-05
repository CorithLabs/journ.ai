import { describe, it, expect } from 'vitest';
import type { Activity, Plan } from '../../../db';
import { activityRef, findDuplicate, nextSlot, normalizeTime, placeInDay, resolveActivity } from '../planOps';

const act = (id: string, name: string, time: string, locationName = ''): Activity => ({
  id, name, time, locationName, notes: '', pinnedToTodo: false,
});
const names = (as: Activity[]) => as.map((a) => a.name);

describe('times, as the app keeps them', () => {
  it.each([
    ['morning', 'morning'], ['Afternoon', 'noon'], ['lunch', 'noon'], ['dinner', 'evening'], ['night', 'night'],
    ['9am', '09:00'], ['7:30 pm', '19:30'], ['12pm', '12:00'], ['12am', '00:00'], ['9:05', '09:05'], ['19:30', '19:30'],
  ])('reads "%s" as %s', (input, out) => {
    expect(normalizeTime(input)).toBe(out);
  });

  it.each(['soonish', '25:00', '', 42])('refuses %s', (input) => {
    expect(normalizeTime(input)).toBeNull();
  });
});

/*
 * The day is shown by part of the day, then list order. Appending put a new
 * morning activity below the morning's others, or with no time at the end.
 */
describe('placing an activity in its day', () => {
  const day = [act('n1', 'Lunch', 'noon'), act('m1', 'Temple', 'morning'), act('e1', 'Dinner', 'evening')];

  it('puts a morning activity among the morning, not at the end of the day', () => {
    expect(names(placeInDay(day, act('x', 'Market', 'morning')))).toEqual(['Temple', 'Market', 'Lunch', 'Dinner']);
  });

  it('puts it first in its part of the day when asked', () => {
    expect(names(placeInDay(day, act('x', 'Market', 'morning'), { position: 'first' }))).toEqual(['Market', 'Temple', 'Lunch', 'Dinner']);
  });

  it('puts it before or after a named neighbour, in that neighbour\'s part of the day', () => {
    const before = placeInDay(day, act('x', 'Coffee', 'evening'), { before: day[0] });
    expect(names(before)).toEqual(['Temple', 'Coffee', 'Lunch', 'Dinner']);
    expect(before.find((a) => a.id === 'x')!.time).toBe('noon');
  });

  it('orders fixed times within a part of the day', () => {
    const timed = [act('a', 'Show', '19:30'), act('b', 'Walk', 'evening')];
    expect(names(placeInDay(timed, act('x', 'Early table', '17:30')))).toEqual(['Early table', 'Show', 'Walk']);
  });
});

describe('finding an activity', () => {
  const plan: Pick<Plan, 'itinerary'> = {
    itinerary: [
      { dayIndex: 0, label: 'Day 1', activities: [act('aaaaaa-1', 'Sensō-ji Temple', 'morning'), act('bbbbbb-1', 'National Museum', 'noon')] },
      { dayIndex: 1, label: 'Day 2', activities: [act('cccccc-1', 'Mori Art Museum', 'noon', 'Roppongi, Tokyo')] },
    ],
  };

  it('by its ref, exactly', () => {
    const r = resolveActivity(plan, { ref: activityRef({ id: 'cccccc-1' }) });
    expect(r.kind === 'found' && r.hit.activity.name).toBe('Mori Art Museum');
  });

  it('by name, ignoring accents and word order', () => {
    const r = resolveActivity(plan, { nameMatch: 'temple senso ji' });
    expect(r.kind === 'found' && r.hit.dayIndex).toBe(0);
  });

  // "The museum" used to mean whichever came first.
  it('says when a name fits more than one, rather than guessing', () => {
    const r = resolveActivity(plan, { nameMatch: 'museum' });
    expect(r.kind).toBe('ambiguous');
  });

  it('narrows by day', () => {
    const r = resolveActivity(plan, { nameMatch: 'museum', dayIndex: 1 });
    expect(r.kind === 'found' && r.hit.activity.name).toBe('Mori Art Museum');
  });

  // "Swap tsukiji on day 2…" when it is on day 1 should say so.
  it('says which day it is on when it is not on the day named', () => {
    const r = resolveActivity(plan, { nameMatch: 'senso', dayIndex: 1 });
    expect(r.kind).toBe('missing');
    expect(r.kind === 'missing' && r.elsewhere?.[0].dayIndex).toBe(0);
  });

  it('matches the location too', () => {
    const r = resolveActivity(plan, { nameMatch: 'roppongi' });
    expect(r.kind === 'found' && r.hit.activity.name).toBe('Mori Art Museum');
  });

  it('knows the same activity already in the trip', () => {
    expect(findDuplicate(plan, 'senso-ji temple')?.dayIndex).toBe(0);
    expect(findDuplicate(plan, 'Tokyo Tower')).toBeNull();
  });
});

describe('a part of the day for an activity given none', () => {
  it('follows the day\'s latest', () => {
    expect(nextSlot([act('a', 'Temple', 'morning')])).toBe('noon');
    expect(nextSlot([])).toBe('morning');
    expect(nextSlot([act('a', 'Bar', 'night')])).toBe('night');
  });
});
