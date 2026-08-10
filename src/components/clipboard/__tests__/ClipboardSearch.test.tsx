import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ClipboardTab from '../../tabs/ClipboardTab';

vi.mock('dexie-react-hooks');

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date().toISOString();
const items = [
  { id: '1', planId: 'plan-1', type: 'Hotel', title: 'Park Hyatt Tokyo', body: 'conf', createdAt: now, updatedAt: now },
  { id: '2', planId: 'plan-1', type: 'Note', title: 'Packing list', body: 'umbrella', createdAt: now, updatedAt: now },
];

function renderTab() {
  vi.mocked(useLiveQuery).mockReturnValue(items);
  render(
    <MemoryRouter>
      <ClipboardTab planId="plan-1" />
    </MemoryRouter>,
  );
}

describe('ClipboardTab — search & filter', () => {
  it('renders search input and filter chips', () => {
    renderTab();
    expect(screen.getByTestId('clipboard-search')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-All')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-Hotel')).toBeInTheDocument();
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

  it('narrows results with a type filter chip', async () => {
    renderTab();
    fireEvent.click(screen.getByTestId('filter-chip-Note'));
    await waitFor(() => {
      expect(screen.getByText('Packing list')).toBeInTheDocument();
      expect(screen.queryByText('Park Hyatt Tokyo')).not.toBeInTheDocument();
    });
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
