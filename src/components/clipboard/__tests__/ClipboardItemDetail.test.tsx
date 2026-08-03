import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ClipboardItemDetail from '../ClipboardItemDetail';
import { db } from '../../../db';

vi.mock('dexie-react-hooks');

// useParams is globally mocked in setup; extend it so itemId resolves here.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ planId: 'plan-1', itemId: 'clip-1' }),
  };
});

const now = new Date().toISOString();

const plan = {
  id: 'plan-1',
  name: 'Tokyo',
  destination: 'Tokyo',
  startDate: '2025-07-14',
  endDate: '2025-07-16',
  createdAt: now,
  updatedAt: now,
  deleted: false,
  itinerary: [
    {
      dayIndex: 0,
      label: 'Day 1 — Mon 14 Jul',
      activities: [
        { id: 'act-1', name: 'Tsukiji Market', time: '08:00', locationName: 'Tsukiji', notes: '', pinnedToTodo: false },
      ],
    },
    { dayIndex: 1, label: 'Day 2 — Tue 15 Jul', activities: [] },
  ],
};

const baseItem = {
  id: 'clip-1',
  planId: 'plan-1',
  type: 'Hotel' as const,
  title: 'Park Hyatt',
  body: 'Room 1203',
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), writable: true, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true, configurable: true });
});

/**
 * The component calls useLiveQuery twice per render, in order: (1) the item,
 * (2) the plan. Alternate the mock return so every render resolves both.
 */
function renderWith(item: typeof baseItem | Record<string, unknown>) {
  let call = 0;
  vi.mocked(useLiveQuery).mockImplementation(() => {
    const isItem = call % 2 === 0;
    call += 1;
    return isItem ? item : plan;
  });
  render(
    <MemoryRouter>
      <ClipboardItemDetail planId="plan-1" />
    </MemoryRouter>,
  );
}

describe('ClipboardItemDetail — linking', () => {
  it('renders the item detail with a Link to itinerary button', () => {
    renderWith(baseItem);
    expect(screen.getByText('Park Hyatt')).toBeInTheDocument();
    expect(screen.getByTestId('link-btn')).toBeInTheDocument();
  });

  it('links to a day + activity and persists { linkedDayIndex, linkedActivityId }', async () => {
    vi.mocked(db.clipboard.update).mockResolvedValue(1);
    renderWith(baseItem);
    fireEvent.click(screen.getByTestId('link-btn'));
    fireEvent.change(await screen.findByTestId('link-day-select'), { target: { value: '0' } });
    fireEvent.change(await screen.findByTestId('link-activity-select'), {
      target: { value: 'act-1' },
    });
    fireEvent.click(screen.getByTestId('confirm-link-btn'));
    await waitFor(() => {
      expect(db.clipboard.update).toHaveBeenCalledWith(
        'clip-1',
        expect.objectContaining({ linkedDayIndex: 0, linkedActivityId: 'act-1' }),
      );
    });
  });

  it('links to a whole day when no activity is chosen', async () => {
    vi.mocked(db.clipboard.update).mockResolvedValue(1);
    renderWith(baseItem);
    fireEvent.click(screen.getByTestId('link-btn'));
    fireEvent.change(await screen.findByTestId('link-day-select'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('confirm-link-btn'));
    await waitFor(() => {
      expect(db.clipboard.update).toHaveBeenCalledWith(
        'clip-1',
        expect.objectContaining({ linkedDayIndex: 1, linkedActivityId: undefined }),
      );
    });
  });

  it('shows the linked badge and supports unlinking', async () => {
    vi.mocked(db.clipboard.update).mockResolvedValue(1);
    renderWith({ ...baseItem, linkedDayIndex: 0, linkedActivityId: 'act-1' });
    expect(screen.getByTestId('linked-badge')).toHaveTextContent('Tsukiji Market');
    fireEvent.click(screen.getByTestId('unlink-btn'));
    await waitFor(() => {
      expect(db.clipboard.update).toHaveBeenCalledWith(
        'clip-1',
        expect.objectContaining({ linkedDayIndex: undefined, linkedActivityId: undefined }),
      );
    });
  });

  it('shows "Activity removed" when the linked activity no longer exists', () => {
    renderWith({ ...baseItem, linkedDayIndex: 0, linkedActivityId: 'gone' });
    expect(screen.getByTestId('linked-badge')).toHaveTextContent(/Activity removed/i);
  });
});
