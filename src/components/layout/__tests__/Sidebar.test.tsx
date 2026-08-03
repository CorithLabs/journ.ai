import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';
import { useLiveQuery } from 'dexie-react-hooks';

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
});
