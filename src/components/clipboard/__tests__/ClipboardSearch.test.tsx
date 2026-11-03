import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ClipboardTab, { SEARCH_FROM } from '../../tabs/ClipboardTab';

vi.mock('dexie-react-hooks');

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date().toISOString();
const two = [
  { id: '1', planId: 'plan-1', type: 'Hotel', title: 'Park Hyatt Tokyo', body: 'conf', createdAt: now, updatedAt: now },
  { id: '2', planId: 'plan-1', type: 'Note', title: 'Packing list', body: 'umbrella', createdAt: now, updatedAt: now },
];
// Enough that a search is worth showing.
const items = [
  ...two,
  ...Array.from({ length: SEARCH_FROM - two.length }, (_, i) => ({
    id: `x${i}`, planId: 'plan-1', type: 'Other', title: `Receipt ${i}`, body: '', createdAt: now, updatedAt: now,
  })),
];

function renderTab(list = items) {
  vi.mocked(useLiveQuery).mockReturnValue(list);
  render(
    <MemoryRouter>
      <ClipboardTab planId="plan-1" />
    </MemoryRouter>,
  );
}

describe('ClipboardTab — search & filter', () => {
  it('offers a search once the list is long enough to need one', () => {
    renderTab();
    expect(screen.getByTestId('clipboard-search')).toBeInTheDocument();
  });

  // A short list is read, not searched; and six type chips were a lot to get
  // past on a phone to reach one boarding pass.
  it('shows neither search nor type chips for a short list', () => {
    renderTab(two);
    expect(screen.queryByTestId('clipboard-search')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-chip-All')).not.toBeInTheDocument();
  });

  it('filters items by search query (debounced)', async () => {
    renderTab();
    fireEvent.change(screen.getByTestId('clipboard-search'), {
      target: { value: 'park hyatt' },
    });
    await waitFor(
      () => {
        expect(screen.getByText('Park Hyatt Tokyo')).toBeInTheDocument();
        expect(screen.queryByText('Packing list')).not.toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });

  // Trip order: things for Day 1 first, whatever order they were saved in.
  it('lists what belongs to a day first, by day', () => {
    renderTab([
      { ...two[1], id: 'n', title: 'Loose note' },
      { ...two[0], id: 'd2', title: 'Day 2 tickets', linkedDayIndex: 1 },
      { ...two[0], id: 'd1', title: 'Day 1 hotel', linkedDayIndex: 0 },
    ]);
    const titles = screen.getAllByTestId('clipboard-card').map((c) => c.textContent ?? '');
    expect(titles[0]).toContain('Day 1 hotel');
    expect(titles[1]).toContain('Day 2 tickets');
    expect(titles[2]).toContain('Loose note');
  });

  it('shows no-results state and a clear button when nothing matches', async () => {
    renderTab();
    fireEvent.change(screen.getByTestId('clipboard-search'), {
      target: { value: 'zzzzz-no-match' },
    });
    await waitFor(
      () => {
        expect(screen.getByTestId('no-results')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
    fireEvent.click(screen.getByTestId('clear-search-btn'));
    await waitFor(() => {
      expect(screen.getByText('Park Hyatt Tokyo')).toBeInTheDocument();
      expect(screen.getByText('Packing list')).toBeInTheDocument();
    });
  });
});
