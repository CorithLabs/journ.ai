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

const mockPlanWithPinned: Plan = {
  ...mockPlan,
  itinerary: [
    {
      ...mockPlan.itinerary[0],
      activities: [
        { id: 'act-1', name: 'Tsukiji Market', time: '08:00', locationName: 'Tokyo', notes: '', pinnedToTodo: true },
        { id: 'act-2', name: 'Senso-ji Temple', time: '11:00', locationName: 'Asakusa', notes: '', pinnedToTodo: false },
      ],
    },
    mockPlan.itinerary[1],
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

  // ── Pin to To-Do (Flow 11) ───────────────────────────────────────────────

  it('renders pin icon on each activity card', () => {
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    const pinBtns = screen.getAllByLabelText('Pin to to-do');
    expect(pinBtns.length).toBeGreaterThan(0);
  });

  it('pinning an activity creates a todo item in IndexedDB', async () => {
    vi.mocked(db.todos.add).mockResolvedValue('new-todo-id');
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    const pinBtn = screen.getAllByLabelText('Pin to to-do')[0];
    fireEvent.click(pinBtn);
    await waitFor(() => {
      expect(db.todos.add).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plan-1',
          title: 'Tsukiji Market',
          sourceActivityId: 'act-1',
          sourceDayIndex: 0,
        }),
      );
    });
  });

  it('pinning updates the activity pinnedToTodo flag in the plan', async () => {
    vi.mocked(db.todos.add).mockResolvedValue('new-todo-id');
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    const pinBtn = screen.getAllByLabelText('Pin to to-do')[0];
    fireEvent.click(pinBtn);
    await waitFor(() => {
      expect(db.plans.update).toHaveBeenCalledWith(
        'plan-1',
        expect.objectContaining({ itinerary: expect.arrayContaining([
          expect.objectContaining({
            activities: expect.arrayContaining([
              expect.objectContaining({ id: 'act-1', pinnedToTodo: true }),
            ]),
          }),
        ]) }),
      );
    });
  });

  it('already-pinned activity shows Unpin label', () => {
    render(<MemoryRouter><ItineraryView plan={mockPlanWithPinned} /></MemoryRouter>);
    expect(screen.getByLabelText('Unpin from to-do')).toBeInTheDocument();
  });

  it('unpinning a pinned activity removes its todo items', async () => {
    // Mock window.confirm to return true
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(db.todos.where).mockReturnValue({
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([{ id: 'todo-pinned' }]),
    } as any);
    vi.mocked(db.todos.bulkDelete).mockResolvedValue(undefined);
    render(<MemoryRouter><ItineraryView plan={mockPlanWithPinned} /></MemoryRouter>);
    const unpinBtn = screen.getByLabelText('Unpin from to-do');
    fireEvent.click(unpinBtn);
    await waitFor(() => {
      expect(db.todos.bulkDelete).toHaveBeenCalledWith(['todo-pinned']);
    });
  });

  it('shows toast confirmation after pinning', async () => {
    vi.mocked(db.todos.add).mockResolvedValue('new-todo-id');
    render(<MemoryRouter><ItineraryView plan={mockPlan} /></MemoryRouter>);
    const pinBtn = screen.getAllByLabelText('Pin to to-do')[0];
    fireEvent.click(pinBtn);
    await waitFor(() => {
      expect(screen.getByText(/"Tsukiji Market" pinned to To-Do/)).toBeInTheDocument();
    });
  });
});
