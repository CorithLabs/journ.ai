import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryTab from './ItineraryTab';
import type { Plan } from '../../db';

// Stub the three child screens so we can assert purely on which one is routed to.
vi.mock('../itinerary/IntakeChat', () => ({
  default: () => <div data-testid="stub-intake-chat">IntakeChat</div>,
}));
vi.mock('../itinerary/GenerateItinerary', () => ({
  default: ({ onGenerated }: { onGenerated: () => void }) => (
    <div data-testid="stub-generate" data-has-callback={typeof onGenerated === 'function'}>
      GenerateItinerary
    </div>
  ),
}));
vi.mock('../itinerary/ItineraryView', () => ({
  default: () => <div data-testid="stub-itinerary-view">ItineraryView</div>,
}));

const mockUseLiveQuery = vi.mocked(useLiveQuery);

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    name: 'Tokyo',
    destination: 'Tokyo',
    startDate: '2025-07-14',
    endDate: '2025-07-18',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deleted: false,
    itinerary: [],
    ...overrides,
  };
}

const completeIntake: NonNullable<Plan['intake']> = {
  numTravellers: 2,
  kids: false,
  kidAges: null,
  likes: ['food'],
  dislikes: [],
  budgetRange: 'mid',
  flightsBooked: false,
  accommodationBooked: false,
};

describe('ItineraryTab routing state machine', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset();
  });

  it('shows a loading spinner while the plan is still loading', () => {
    mockUseLiveQuery.mockReturnValue(undefined);
    render(<ItineraryTab planId="p1" />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('State 1 — no intake: renders IntakeChat', () => {
    mockUseLiveQuery.mockReturnValue(basePlan());
    render(<ItineraryTab planId="p1" />);
    expect(screen.getByTestId('stub-intake-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-generate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stub-itinerary-view')).not.toBeInTheDocument();
  });

  it('State 1 — intake present but budgetRange not set: still renders IntakeChat', () => {
    mockUseLiveQuery.mockReturnValue(
      basePlan({ intake: { ...completeIntake, budgetRange: null } }),
    );
    render(<ItineraryTab planId="p1" />);
    expect(screen.getByTestId('stub-intake-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-generate')).not.toBeInTheDocument();
  });

  it('State 2 — completed intake, empty itinerary: renders GenerateItinerary with a callback', () => {
    mockUseLiveQuery.mockReturnValue(
      basePlan({ intake: completeIntake, itinerary: [] }),
    );
    render(<ItineraryTab planId="p1" />);
    const gen = screen.getByTestId('stub-generate');
    expect(gen).toBeInTheDocument();
    expect(gen).toHaveAttribute('data-has-callback', 'true');
    expect(screen.queryByTestId('stub-intake-chat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stub-itinerary-view')).not.toBeInTheDocument();
  });

  it('State 3 — itinerary present: renders ItineraryView', () => {
    mockUseLiveQuery.mockReturnValue(
      basePlan({
        intake: completeIntake,
        itinerary: [
          { dayIndex: 0, label: 'Day 1', activities: [] },
        ],
      }),
    );
    render(<ItineraryTab planId="p1" />);
    expect(screen.getByTestId('stub-itinerary-view')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-generate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stub-intake-chat')).not.toBeInTheDocument();
  });

  it('State 3 takes precedence — a partial/interrupted itinerary still routes to ItineraryView', () => {
    mockUseLiveQuery.mockReturnValue(
      basePlan({
        intake: completeIntake,
        itinerary: [{ dayIndex: 0, label: 'Day 1', activities: [] }],
      }),
    );
    render(<ItineraryTab planId="p1" />);
    expect(screen.getByTestId('stub-itinerary-view')).toBeInTheDocument();
  });
});
