import { describe, it, expect } from 'vitest';
import { isIntakeComplete } from '../planState';
import type { Plan } from '../../db';

const base: Plan = {
  id: 'p1',
  name: 'Tokyo',
  destination: 'Tokyo',
  startDate: '2025-07-14',
  endDate: '2025-07-16',
  createdAt: '',
  updatedAt: '',
  deleted: false,
  itinerary: [],
};

const intake = (over: Partial<NonNullable<Plan['intake']>> = {}) => ({
  numTravellers: 2,
  kids: false,
  kidAges: null,
  likes: [],
  dislikes: [],
  budgetRange: 'mid' as const,
  flightsBooked: false,
  accommodationBooked: false,
  ...over,
});

describe('isIntakeComplete', () => {
  it('is false with no intake at all', () => {
    expect(isIntakeComplete(base)).toBe(false);
  });

  // budgetRange is the last question, so a partially-filled intake must not
  // count — otherwise the agent appears beside the intake chat mid-conversation.
  it('is false while intake is still mid-conversation', () => {
    expect(isIntakeComplete({ ...base, intake: intake({ budgetRange: null }) })).toBe(false);
  });

  it('is true once the budget question is answered', () => {
    expect(isIntakeComplete({ ...base, intake: intake() })).toBe(true);
  });

  it('tolerates a missing plan while it loads', () => {
    expect(isIntakeComplete(undefined)).toBe(false);
    expect(isIntakeComplete(null)).toBe(false);
  });
});
