import { describe, it, expect } from 'vitest';
import type { Activity, Plan } from '../../db';
import { dayPlace, dayTripTown } from '../dayPlace';

const act = (name: string, locationName: string): Activity => ({
  id: name, name, time: 'morning', locationName, notes: '', pinnedToTodo: false,
});

const tokyo = { destination: 'Tokyo, Japan' };

describe('a day trip out of the destination', () => {
  it('is read from where the day goes', () => {
    const day = { activities: [
      act('Tosho-gu', 'Nikko, Japan'),
      act('Kegon Falls', 'Nikko, Japan'),
      act('Train back', 'Tokyo, Japan'),
    ] };
    expect(dayTripTown(tokyo, day)).toBe('Nikko, Japan');
  });

  // A neighbourhood written with its city is still the city.
  it('does not mistake a neighbourhood for somewhere else', () => {
    const day = { activities: [act('Senso-ji', 'Asakusa, Tokyo'), act('Market', 'Asakusa, Tokyo')] };
    expect(dayTripTown(tokyo, day)).toBeNull();
  });

  // One stop outside the city is an errand, not a day out.
  it('needs two places in the same town', () => {
    const day = { activities: [act('Outlet mall', 'Gotemba, Japan'), act('Lunch', 'Shibuya, Tokyo')] };
    expect(dayTripTown(tokyo, day)).toBeNull();
  });

  it('needs most of the day to be away', () => {
    const day = { activities: [
      act('A', 'Nikko, Japan'), act('B', 'Nikko, Japan'),
      act('C', 'Shibuya, Tokyo'), act('D', 'Ginza, Tokyo'), act('E', 'Ueno, Tokyo'),
    ] };
    expect(dayTripTown(tokyo, day)).toBeNull();
  });
});

describe('where a day is spent', () => {
  const plan = (over: Partial<Plan> = {}): Plan => ({
    id: 'p', name: 'Trip', destination: 'Tokyo, Japan', startDate: '2026-10-09', endDate: '2026-10-11',
    createdAt: '', updatedAt: '', deleted: false, itinerary: [], ...over,
  });

  it('is the destination on an ordinary day', () => {
    expect(dayPlace(plan(), { dayIndex: 0, activities: [act('Senso-ji', 'Asakusa, Tokyo')] })).toBe('Tokyo, Japan');
  });

  it('is the route city on a multi-city trip', () => {
    const p = plan({ stops: [{ id: 's', city: 'Kyoto', nights: 2 }] });
    expect(dayPlace(p, { dayIndex: 1, activities: [act('Fushimi Inari', 'Kyoto')] })).toBe('Kyoto');
  });
});
