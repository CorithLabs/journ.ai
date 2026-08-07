import { describe, it, expect } from 'vitest';
import { isIntakeComplete, itineraryStage } from '../planState';
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

const day = { dayIndex: 0, label: 'Day 1', activities: [] };

describe('itineraryStage', () => {
  it('starts at intake for a brand new plan', () => {
    expect(itineraryStage(base)).toBe('intake');
  });

  it('offers generation once intake is complete but no itinerary exists', () => {
    expect(itineraryStage({ ...base, intake: intake() })).toBe('generate');
  });

  it('shows the itinerary once one has been generated', () => {
    expect(itineraryStage({ ...base, intake: intake(), itinerary: [day] })).toBe('view');
  });

  // The bug: a manual plan has days but never answers the intake questions.
  // Checking intake first sent it back to the chat "Build it myself" escaped,
  // and kept the AI agent hidden on exactly the plans that need it most.
  it('shows the itinerary for a manual plan that has days but no intake', () => {
    expect(itineraryStage({ ...base, itinerary: [day] })).toBe('view');
  });

  it('treats an empty itinerary array as no itinerary', () => {
    expect(itineraryStage({ ...base, intake: intake(), itinerary: [] })).toBe('generate');
  });

  it('tolerates a missing plan while it loads', () => {
    expect(itineraryStage(undefined)).toBe('intake');
  });
});
