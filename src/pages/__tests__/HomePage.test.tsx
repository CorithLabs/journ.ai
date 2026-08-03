import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import HomePage from '../HomePage';
import { db } from '../../db';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('HomePage plan list query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries plans with the boolean-safe .filter() pattern, not .where(deleted)', () => {
    // The mocked useLiveQuery calls the factory once so we can inspect which
    // Dexie query pattern HomePage uses. The ONLY correct pattern is
    // db.plans.filter(p => !p.deleted).sortBy('createdAt').
    // .where('deleted').equals(false as unknown as string) throws a runtime
    // DataError on real IndexedDB — this test guards against that regression.
    const sortBy = vi.fn().mockResolvedValue([]);
    const filter = vi.mocked(db.plans.filter).mockReturnValue({
      sortBy,
    } as never);

    vi.mocked(useLiveQuery).mockImplementation((factory: () => unknown) => {
      factory();
      return [];
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    // Safe pattern used...
    expect(filter).toHaveBeenCalledTimes(1);
    // ...and the predicate excludes soft-deleted plans.
    const predicate = filter.mock.calls[0][0] as (p: { deleted: boolean }) => boolean;
    expect(predicate({ deleted: false })).toBe(true);
    expect(predicate({ deleted: true })).toBe(false);
    // ...sorted by createdAt.
    expect(sortBy).toHaveBeenCalledWith('createdAt');
    // The unsafe index-based pattern must NOT be used.
    expect(db.plans.where).not.toHaveBeenCalled();
  });

  it('shows the empty state CTA when there are no plans', () => {
    vi.mocked(useLiveQuery).mockReturnValue([]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: /start your first trip/i }),
    ).toBeInTheDocument();
  });

  it('navigates to the new plan route from the empty-state CTA', () => {
    vi.mocked(useLiveQuery).mockReturnValue([]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /start your first trip/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/plan/new');
  });

  it('shows the sidebar hint when plans already exist', () => {
    vi.mocked(useLiveQuery).mockReturnValue([
      {
        id: '1',
        name: 'Tokyo',
        destination: 'Tokyo',
        startDate: '2025-03-14',
        endDate: '2025-03-20',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        deleted: false,
        itinerary: [],
      },
    ]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/select a plan from the sidebar/i)).toBeInTheDocument();
  });
});
