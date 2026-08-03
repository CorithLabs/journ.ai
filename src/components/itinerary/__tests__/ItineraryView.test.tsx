import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ItineraryView from '../ItineraryView';
import type { Plan } from '../../../db';
import { db } from '../../../db';

const mockPlan: Plan = {
  id: 'plan-1',
  name: 'Tokyo',
  destination: 'Tokyo',
  startDate: '2025-07-14',
  endDate: '2025-07-20',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deleted: false,
  itinerary: [
    {
      dayIndex: 0,
      label: 'Day 1 — Mon 14 Jul',
      activities: [
        { id: 'act-1', name: 'Tsukiji Market', time: '08:00', locationName: 'Tokyo', notes: 'Great sushi', pinnedToTodo: false },
        { id: 'act-2', name: 'Senso-ji Temple', time: '11:00', locationName: 'Asakusa', notes: '', pinnedToTodo: false },
      ],
    },
    {
      dayIndex: 1,
      label: 'Day 2 — Tue 15 Jul',
      activities: [],
    },
  ],
};

describe('ItineraryView', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders day sections', () => {
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    expect(screen.getByText('Day 1 — Mon 14 Jul')).toBeInTheDocument();
    expect(screen.getByText('Day 2 — Tue 15 Jul')).toBeInTheDocument();
  });

  it('renders activities in order', () => {
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    expect(screen.getByText('Tsukiji Market')).toBeInTheDocument();
    expect(screen.getByText('Senso-ji Temple')).toBeInTheDocument();
  });

  it('collapses a day when its expand/collapse button is clicked', async () => {
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    // Find the button that has aria-expanded=true (expanded day headers)
    const expandedButtons = screen.getAllByRole('button', { expanded: true });
    // Click the first one (Day 1)
    fireEvent.click(expandedButtons[0]);
    await waitFor(() => {
      expect(screen.queryByText('Tsukiji Market')).not.toBeInTheDocument();
    });
  });

  it('renders day jump selector buttons', () => {
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    // Day jump buttons show "Day 1" extracted from "Day 1 — Mon 14 Jul"
    expect(screen.getByText('Day 1')).toBeInTheDocument();
    expect(screen.getByText('Day 2')).toBeInTheDocument();
  });

  it('renders estimated daily spend badge when present', () => {
    const planWithSpend: Plan = {
      ...mockPlan,
      itinerary: [{
        ...mockPlan.itinerary[0],
        estimatedDailySpend: { min: 80, max: 150, currency: 'USD' },
      }, mockPlan.itinerary[1]],
    };
    render(<MemoryRouter><ItineraryView plan={planWithSpend} /></MemoryRouter>);
    expect(screen.getByText(/Est\. \$80/)).toBeInTheDocument();
  });

  it('calls db update when activity is deleted', async () => {
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    const deleteBtn = screen.getAllByLabelText('Delete activity')[0];
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(db.plans.update).toHaveBeenCalled();
    });
  });
});
