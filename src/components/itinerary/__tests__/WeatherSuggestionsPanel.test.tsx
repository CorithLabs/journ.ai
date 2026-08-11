import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WeatherSuggestionsPanel, { parseSuggestions } from '../WeatherSuggestionsPanel';
import { type Plan } from '../../../db';

const mockPlan: Plan = {
  id: 'plan-1',
  name: 'Tokyo Trip',
  destination: 'Tokyo, Japan',
  startDate: '2025-07-14',
  endDate: '2025-07-16',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deleted: false,
  itinerary: [
    {
      dayIndex: 0,
      label: 'Day 1 — Mon 14 Jul',
      activities: [
        { id: 'a1', name: 'Temple Visit', time: '09:00', locationName: 'Tokyo', notes: '', pinnedToTodo: false },
        { id: 'a2', name: 'River Cruise', time: '14:00', locationName: 'Asakusa', notes: '', pinnedToTodo: false },
      ],
    },
    {
      dayIndex: 1,
      label: 'Day 2 — Tue 15 Jul',
      activities: [
        { id: 'a3', name: 'Museum Visit', time: '10:00', locationName: 'Ueno', notes: '', pinnedToTodo: false },
      ],
    },
  ],
};

describe('parseSuggestions', () => {
  it('parses a day swap suggestion', () => {
    const text = `
DAY SWAP: Swap Day 1 with Day 2 since Day 2 has clear weather.
    `.trim();
    const suggestions = parseSuggestions(text, mockPlan, 0);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].type).toBe('swap');
    expect(suggestions[0].description).toContain('Day 2');
  });

  it('parses an alternative suggestion with arrow', () => {
    const text = `
ALTERNATIVE: River Cruise → Indoor Cooking Class
    `.trim();
    const suggestions = parseSuggestions(text, mockPlan, 0);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const alt = suggestions.find(s => s.type === 'alternative');
    expect(alt).toBeTruthy();
    expect(alt!.replacement?.name).toContain('Indoor Cooking Class');
    expect(alt!.originalActivity?.name).toContain('River Cruise');
  });

  it('parses a budget warning in alternative suggestion', () => {
    const text = `ALTERNATIVE: River Cruise → Luxury Spa (budget warning)`;
    const suggestions = parseSuggestions(text, mockPlan, 0);
    expect(suggestions[0].budgetWarning).toBe(true);
  });

  it('creates a generic suggestion when no structured format found', () => {
    const text = 'Consider staying indoors due to heavy rain.';
    const suggestions = parseSuggestions(text, mockPlan, 0);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].description).toBe(text);
  });

  it('returns empty array for empty text', () => {
    const suggestions = parseSuggestions('', mockPlan, 0);
    expect(suggestions.length).toBe(0);
  });
});

describe('WeatherSuggestionsPanel', () => {
  const mockSuggestions = [
    {
      id: 'sug-1',
      type: 'swap' as const,
      swapDayIndex: 1,
      description: 'Swap Day 1 with Day 2 (clear weather on Day 2)',
      budgetWarning: false,
    },
    {
      id: 'sug-2',
      type: 'alternative' as const,
      originalActivity: mockPlan.itinerary[0].activities[1],
      originalDayIndex: 0,
      replacement: {
        id: 'new-a2',
        name: 'Indoor Cooking Class',
        time: '14:00',
        locationName: 'Ginza',
        notes: 'Great indoor alternative',
        pinnedToTodo: false,
      },
      description: 'River Cruise → Indoor Cooking Class',
      budgetWarning: false,
    },
  ];

  /*
   * One at a time now: three cards of prose in a panel this size is a wall,
   * and only one of them can be acted on first anyway.
   */
  it('renders suggestion cards', () => {
    render(
      <WeatherSuggestionsPanel
        plan={mockPlan}
        affectedDayIndex={0}
        suggestions={mockSuggestions}
        onClose={vi.fn()}
        onToast={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('suggestion-card').length).toBe(1);
    expect(screen.getByTestId('suggestion-carousel')).toBeInTheDocument();
  });

  it('shows budget warning badge when suggestion has budgetWarning', () => {
    const withBudgetWarning = [
      { ...mockSuggestions[1], budgetWarning: true },
    ];
    render(
      <WeatherSuggestionsPanel
        plan={mockPlan}
        affectedDayIndex={0}
        suggestions={withBudgetWarning}
        onClose={vi.fn()}
        onToast={vi.fn()}
      />,
    );
    expect(screen.getByText(/Budget warning/)).toBeTruthy();
  });

  it('removes a suggestion card when rejected', () => {
    render(
      <WeatherSuggestionsPanel
        plan={mockPlan}
        affectedDayIndex={0}
        suggestions={[mockSuggestions[0]]}
        onClose={vi.fn()}
        onToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('reject-suggestion-btn'));
    expect(screen.queryByTestId('suggestion-card')).toBeNull();
    expect(screen.getByText(/All suggestions have been reviewed/)).toBeTruthy();
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(
      <WeatherSuggestionsPanel
        plan={mockPlan}
        affectedDayIndex={0}
        suggestions={mockSuggestions}
        onClose={onClose}
        onToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close suggestions panel'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});


const suggestionFixtures = [
  {
    id: 'sug-1',
    type: 'swap' as const,
    swapDayIndex: 1,
    description: 'Swap Day 1 with Day 2 — Day 2 is clear',
    budgetWarning: false,
  },
  {
    id: 'sug-2',
    type: 'alternative' as const,
    originalActivity: mockPlan.itinerary[0].activities[1],
    originalDayIndex: 0,
    replacement: {
      id: 'new-a2', name: 'Indoor Cooking Class', time: '14:00',
      locationName: 'Ginza', notes: '', pinnedToTodo: false,
    },
    description: 'River Cruise → Indoor Cooking Class',
    budgetWarning: false,
  },
];

/*
 * The suggestion arrived as prose from a model that writes markdown by habit
 * and was printed straight into the card, marks and all. The change itself is
 * drawn now — the two things, and the move between them.
 */
describe('reading a suggestion at a glance', () => {
  const show = (suggestions = suggestionFixtures) => render(
    <WeatherSuggestionsPanel
      plan={mockPlan}
      affectedDayIndex={0}
      suggestions={suggestions}
      onClose={vi.fn()}
      onToast={vi.fn()}
    />,
  );

  it('draws a swap as the two days', () => {
    show([suggestionFixtures[0]]);
    const change = screen.getByTestId('suggestion-change');
    expect(change).toHaveTextContent(mockPlan.itinerary[0].label);
  });

  it('draws an alternative as the two activities', () => {
    show([suggestionFixtures[1]]);
    expect(screen.getByTestId('suggestion-change')).toBeInTheDocument();
  });

  it('leaves no markdown marks in the reason it gives', () => {
    show([{ ...suggestionFixtures[0], description: '**Move it** to `Day 2` — the *rain* clears' }]);
    const reason = screen.queryByTestId('suggestion-reason');
    expect(reason?.textContent ?? '').not.toMatch(/[*`_]/);
  });
});

describe('stepping through several', () => {
  const show = () => render(
    <WeatherSuggestionsPanel
      plan={mockPlan}
      affectedDayIndex={0}
      suggestions={suggestionFixtures}
      onClose={vi.fn()}
      onToast={vi.fn()}
    />,
  );

  it('starts at the first, with nowhere back to go', () => {
    show();
    expect(screen.getByTestId('suggestion-prev')).toBeDisabled();
  });

  it('moves to the next', () => {
    show();
    fireEvent.click(screen.getByTestId('suggestion-next'));
    expect(screen.getByTestId('suggestion-next')).toBeDisabled();
    expect(screen.getByTestId('suggestion-prev')).not.toBeDisabled();
  });

  it('says where you are, for anyone who cannot see the dots', () => {
    show();
    expect(screen.getByRole('status')).toHaveTextContent('Suggestion 1 of 2');
  });

  // Answering the last one must not leave the carousel pointing past the end.
  it('does not run off the end when one is answered', () => {
    show();
    fireEvent.click(screen.getByTestId('suggestion-next'));
    fireEvent.click(screen.getByTestId('reject-suggestion-btn'));
    expect(screen.getByTestId('suggestion-card')).toBeInTheDocument();
  });

  it('drops the controls once only one is left', () => {
    show();
    fireEvent.click(screen.getByTestId('reject-suggestion-btn'));
    expect(screen.queryByTestId('suggestion-carousel')).not.toBeInTheDocument();
  });
});
