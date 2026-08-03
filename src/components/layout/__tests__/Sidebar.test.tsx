import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db';

vi.mock('dexie-react-hooks');

const mockUseLiveQuery = vi.mocked(useLiveQuery);

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sidebar with the app logo', () => {
    mockUseLiveQuery.mockReturnValue([]);
    renderSidebar();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByText('Journ.ai')).toBeInTheDocument();
  });

  it('shows New Plan button', () => {
    mockUseLiveQuery.mockReturnValue([]);
    renderSidebar();
    expect(screen.getByLabelText('Create new plan')).toBeInTheDocument();
  });

  it('shows empty state when no plans exist', () => {
    mockUseLiveQuery.mockReturnValue([]);
    renderSidebar();
    expect(screen.getByTestId('sidebar-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/No trips yet/i)).toBeInTheDocument();
  });

  it('renders plan rows when plans exist', () => {
    mockUseLiveQuery.mockReturnValue([
      {
        id: 'plan-1',
        name: 'Tokyo',
        destination: 'Tokyo',
        startDate: '2025-03-14',
        endDate: '2025-03-20',
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        itinerary: [],
      },
    ]);
    renderSidebar();
    expect(screen.getByText('Tokyo')).toBeInTheDocument();
  });

  it('shows settings button at the bottom', () => {
    mockUseLiveQuery.mockReturnValue([]);
    renderSidebar();
    expect(screen.getByLabelText('Open settings')).toBeInTheDocument();
  });

  it('shows loading skeleton when plans is undefined', () => {
    mockUseLiveQuery.mockReturnValue(undefined);
    renderSidebar();
    // No empty state, no plans — just the skeleton
    expect(screen.queryByTestId('sidebar-empty-state')).not.toBeInTheDocument();
  });

  it('queries plans with .equals(false) not .equals(0) — boolean soft-delete regression', () => {
    // This test verifies that when useLiveQuery runs its factory function,
    // it calls db.plans.where('deleted').equals(false) — NOT .equals(0).
    // Using .equals(0) silently returns no results because Dexie treats
    // false !== 0 in indexed comparisons.
    mockUseLiveQuery.mockReturnValue([]);

    const equalsMock = vi.mocked(db.plans.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        sortBy: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as ReturnType<typeof db.plans.where>);

    renderSidebar();

    // Extract the factory function passed to useLiveQuery and invoke it
    const factoryFn = mockUseLiveQuery.mock.calls[0]?.[0];
    if (typeof factoryFn === 'function') {
      factoryFn();
      expect(equalsMock).toHaveBeenCalledWith('deleted');
      const equalsCall = (equalsMock.mock.results[0]?.value as { equals: ReturnType<typeof vi.fn> })?.equals;
      // The argument to .equals() must be the boolean false, never the number 0
      expect(equalsCall).toHaveBeenCalledWith(false);
      expect(equalsCall).not.toHaveBeenCalledWith(0);
    }
  });
});
