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
    localStorage.clear();
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

  it('renders plan rows with destination and date range when plans exist', () => {
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
    // Date range is rendered on the plan row
    expect(screen.getByText(/Mar 14/)).toBeInTheDocument();
  });

  // Nothing AI-driven works without a key, so the warning is surfaced where
  // the fix is rather than only failing at the point of use.
  describe('API key warning', () => {
    it('flags the settings entry when no provider key is stored', () => {
      renderSidebar();
      expect(screen.getByTestId('settings-key-alert')).toBeInTheDocument();
      expect(screen.getByLabelText(/API key required/)).toBeInTheDocument();
    });

    it('clears the flag once a key exists for either provider', () => {
      localStorage.setItem(
        'aitp_anthropic_key',
        JSON.stringify({ ciphertext: 'x', iv: 'y' }),
      );
      renderSidebar();
      expect(screen.queryByTestId('settings-key-alert')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Open settings')).toBeInTheDocument();
    });
  });

  it('shows settings button at the bottom', () => {
    localStorage.setItem(
      'aitp_api_key',
      JSON.stringify({ ciphertext: 'x', iv: 'y' }),
    );
    mockUseLiveQuery.mockReturnValue([]);
    renderSidebar();
    expect(screen.getByLabelText('Open settings')).toBeInTheDocument();
  });

  it('shows a collapse/expand hamburger toggle', () => {
    mockUseLiveQuery.mockReturnValue([]);
    renderSidebar();
    // Sidebar starts expanded, so the toggle collapses it.
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument();
  });

  it('shows loading skeleton when plans is undefined', () => {
    mockUseLiveQuery.mockReturnValue(undefined);
    renderSidebar();
    // No empty state, no plans — just the skeleton
    expect(screen.queryByTestId('sidebar-empty-state')).not.toBeInTheDocument();
  });

  it('queries plans with .filter(p => !p.deleted).sortBy — soft-delete regression', async () => {
    // Regression test: Plan.deleted is stored as a boolean. Index-based
    // .where('deleted').equals(0) silently returns no results, and
    // .equals(false as unknown as string) is a TypeScript footgun. The ONLY
    // correct pattern is `.filter(p => !p.deleted).sortBy('createdAt')`.
    // We capture the query factory passed to useLiveQuery, run it against the
    // mocked db, and assert it exercises .filter (NOT .where) and sorts by
    // 'createdAt'.
    const capturedFactories: (() => unknown)[] = [];
    mockUseLiveQuery.mockImplementation((factory) => {
      if (typeof factory === 'function') {
        capturedFactories.push(factory as () => unknown);
      }
      return [];
    });

    renderSidebar();

    expect(capturedFactories.length).toBeGreaterThan(0);

    const plansTable = vi.mocked(db.plans);
    const sortBy = vi.fn().mockResolvedValue([]);
    plansTable.filter.mockReturnValue({ sortBy } as unknown as ReturnType<
      typeof plansTable.filter
    >);

    // Run the captured query factory — it should call
    // db.plans.filter(...).sortBy('createdAt')
    await capturedFactories[0]();

    // Correct pattern used
    expect(plansTable.filter).toHaveBeenCalledTimes(1);
    expect(sortBy).toHaveBeenCalledWith('createdAt');

    // Forbidden index-based pattern (.where('deleted').equals(...)) NOT used
    expect(plansTable.where).not.toHaveBeenCalled();

    // The predicate passed to filter excludes soft-deleted plans and keeps live ones
    const predicate = plansTable.filter.mock.calls[0][0] as (p: {
      deleted: boolean;
    }) => boolean;
    expect(predicate({ deleted: false })).toBe(true);
    expect(predicate({ deleted: true })).toBe(false);
  });
});
