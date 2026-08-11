import { describe, it, expect } from 'vitest';
import { cityForDay, swappableDays } from '../dayCity';
import type { Plan, Day } from '../../db';

const day = (dayIndex: number, ...names: string[]): Day => ({
  dayIndex,
  label: `Day ${dayIndex + 1}`,
  activities: names.map((n, i) => ({
    id: `a${dayIndex}${i}`, name: n, time: 'morning',
    locationName: '', notes: '', pinnedToTodo: false,
  })),
});

const japan = (days: Day[]): Plan => ({
  id: 'p1', name: 'Japan', destination: 'Tokyo', country: 'Japan',
  startDate: '2025-08-01', endDate: '2025-08-05',
  createdAt: '', updatedAt: '', deleted: false,
  stops: [{ id: 's1', city: 'Osaka', nights: 2 }],
  itinerary: days,
});

/*
 * Weather is a city, not a coordinate. Forecasting the destination and showing
 * it on every day says nothing about the day spent 400km away — and a rainy
 * Tokyo day cannot trade activities with a clear Osaka one.
 */
describe('which city a day is in', () => {
  it('believes what the day says it is doing', () => {
    const plan = japan([day(0, 'Osaka Castle'), day(1, 'Shibuya crossing')]);
    expect(cityForDay(plan, plan.itinerary[0])).toBe('Osaka');
  });

  it('reads the location as well as the name', () => {
    const plan = japan([{
      ...day(0, 'Castle'),
      activities: [{ id: 'x', name: 'Castle', time: 'morning', locationName: 'Osaka', notes: '', pinnedToTodo: false }],
    }]);
    expect(cityForDay(plan, plan.itinerary[0])).toBe('Osaka');
  });

  // Falling back to the route and its nights when a day says nothing.
  it('walks the route by nights when the day is silent', () => {
    const plan = japan([day(0), day(1), day(2), day(3), day(4)]);
    expect(cityForDay(plan, plan.itinerary[0])).toBe('Tokyo');
    expect(cityForDay(plan, plan.itinerary[4])).toBe('Osaka');
  });

  it('is simply the destination on a single-city trip', () => {
    const plan: Plan = { ...japan([day(0)]), stops: [] };
    expect(cityForDay(plan, plan.itinerary[0])).toBe('Tokyo');
  });

  it('does not care about case', () => {
    const plan = japan([day(0, 'dinner in OSAKA')]);
    expect(cityForDay(plan, plan.itinerary[0])).toBe('Osaka');
  });
});

/*
 * Decided here rather than asked of the AI: it is a fact about the trip, not
 * a matter of judgement, and asking invites a wrong answer to a settled
 * question.
 */
describe('which days could take another day’s activities', () => {
  const plan = japan([
    day(0, 'Shibuya crossing'),
    day(1, 'Ueno park'),
    day(2, 'Osaka Castle'),
    day(3, 'Dotonbori, Osaka'),
  ]);

  it('offers only the days in the same city', () => {
    expect(swappableDays(plan, 0).map(d => d.dayIndex)).toEqual([1]);
  });

  it('offers the other city its own days', () => {
    expect(swappableDays(plan, 2).map(d => d.dayIndex)).toEqual([3]);
  });

  // The whole point: a clear Osaka day is no help to a rainy Tokyo one.
  it('never offers a day in another city', () => {
    for (const index of [0, 1, 2, 3]) {
      const from = cityForDay(plan, plan.itinerary[index]);
      for (const d of swappableDays(plan, index)) {
        expect(cityForDay(plan, d)).toBe(from);
      }
    }
  });

  it('offers nothing when the city has only the one day', () => {
    const single = japan([day(0, 'Shibuya crossing'), day(1, 'Osaka Castle')]);
    expect(swappableDays(single, 0)).toEqual([]);
  });

  it('never offers the day itself', () => {
    expect(swappableDays(plan, 0).some(d => d.dayIndex === 0)).toBe(false);
  });
});
