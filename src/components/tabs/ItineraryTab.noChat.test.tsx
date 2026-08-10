import { render, screen } from '../../test/render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryTab from './ItineraryTab';
import type { Plan } from '../../db';

/**
 * Regression guard for the "duplicate chat widget" bug.
 *
 * The AI agent FAB + slide-in panel (rendered at the PlanWorkspace level) is the
 * ONE and ONLY chat interface. Once a plan has a generated itinerary, the
 * itinerary tab's main content area must render the day-by-day ItineraryView
 * ONLY — never an inline chat input, message list, or IntakeChat widget.
 *
 * These tests render the real ItineraryTab (no child stubs) and assert on the
 * concrete DOM: the intake chat testid and its chat composer input must be
 * absent when an itinerary exists.
 */

const mockUseLiveQuery = vi.mocked(useLiveQuery);

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    name: 'Kyoto',
    destination: 'Kyoto',
    startDate: '2025-07-14',
    endDate: '2025-07-16',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deleted: false,
    intake: {
      numTravellers: 2,
      kids: false,
      kidAges: null,
      likes: ['temples'],
      dislikes: [],
      budgetRange: 'mid',
      flightsBooked: true,
      accommodationBooked: true,
    },
    itinerary: [
      {
        dayIndex: 0,
        label: 'Day 1 — Mon 14 Jul',
        activities: [
          {
            id: 'a1',
            name: 'Fushimi Inari',
            time: '08:00',
            locationName: 'Kyoto',
            notes: '',
            pinnedToTodo: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('ItineraryTab — no duplicate chat widget after generation', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset();
  });

  it('renders the itinerary day view and NO chat widget when an itinerary exists', () => {
    mockUseLiveQuery.mockReturnValue(basePlan());
    render(<ItineraryTab planId="p1" />);

    // Day view is present…
    expect(screen.getByTestId('itinerary-view')).toBeInTheDocument();
    expect(screen.getByText('Day 1 — Mon 14 Jul')).toBeInTheDocument();

    // …and the intake chat UI + its composer input are absent from the
    // main content area (the agent FAB panel lives elsewhere).
    expect(screen.queryByTestId('intake-chat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('intake-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('generate-itinerary-btn')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Type your answer…'),
    ).not.toBeInTheDocument();
  });

  it('still shows the IntakeChat composer BEFORE intake is complete (mid-intake unaffected)', () => {
    mockUseLiveQuery.mockReturnValue(
      basePlan({ intake: undefined, itinerary: [] }),
    );
    render(<ItineraryTab planId="p1" />);

    // Mid-intake, the chat UI is the correct thing to show.
    expect(screen.getByTestId('intake-chat')).toBeInTheDocument();
    expect(screen.getByTestId('intake-input')).toBeInTheDocument();
    // But the itinerary day view must not be rendered yet.
    expect(screen.queryByTestId('itinerary-view')).not.toBeInTheDocument();
  });
});
