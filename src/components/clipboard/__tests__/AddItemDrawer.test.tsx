import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import AddItemDrawer from '../AddItemDrawer';
import ClipboardTab from '../../tabs/ClipboardTab';
import { BODY_MAX, BODY_WARN } from '../clipboardConstants';
import { db } from '../../../db';

vi.mock('dexie-react-hooks');

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:preview'),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

describe('AddItemDrawer — text note', () => {
  it('saves a note with type, title and body to IndexedDB', async () => {
    vi.mocked(db.clipboard.add).mockResolvedValue('new-id');
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<AddItemDrawer planId="plan-1" onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByTestId('type-select'), { target: { value: 'Hotel' } });
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Park Hyatt Tokyo' },
    });
    fireEvent.change(screen.getByTestId('body-input'), {
      target: { value: 'Confirmation #ABC123' },
    });
    fireEvent.click(screen.getByTestId('save-item-btn'));

    await waitFor(() => {
      expect(db.clipboard.add).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plan-1',
          type: 'Hotel',
          title: 'Park Hyatt Tokyo',
          body: 'Confirmation #ABC123',
        }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('falls back to the type as the title when title is empty', async () => {
    vi.mocked(db.clipboard.add).mockResolvedValue('new-id');
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByTestId('type-select'), { target: { value: 'Note' } });
    fireEvent.click(screen.getByTestId('save-item-btn'));
    await waitFor(() => {
      expect(db.clipboard.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Note' }),
      );
    });
  });

  it('warns when the body approaches the character limit', () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByTestId('body-input'), {
      target: { value: 'x'.repeat(BODY_WARN + 1) },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Approaching/i);
  });

  it('disables save and shows an error when body exceeds the hard limit', () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByTestId('body-input'), {
      target: { value: 'x'.repeat(BODY_MAX + 1) },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds/i);
    expect(screen.getByTestId('save-item-btn')).toBeDisabled();
  });
});

describe('ClipboardTab', () => {
  const noteItem = {
    id: 'clip-1',
    planId: 'plan-1',
    type: 'Note' as const,
    title: 'Packing reminders',
    body: 'Bring adapters',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('shows an empty state when there are no items', () => {
    vi.mocked(useLiveQuery).mockReturnValue([]);
    render(
      <MemoryRouter>
        <ClipboardTab planId="plan-1" />
      </MemoryRouter>,
    );
    expect(screen.getByText('No items yet')).toBeInTheDocument();
  });

  it('opens the add drawer when clicking Add item', async () => {
    vi.mocked(useLiveQuery).mockReturnValue([]);
    render(
      <MemoryRouter>
        <ClipboardTab planId="plan-1" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('add-item-form')).toBeInTheDocument();
    });
  });

  it('renders saved items as cards grouped by type', () => {
    vi.mocked(useLiveQuery).mockReturnValue([noteItem]);
    render(
      <MemoryRouter>
        <ClipboardTab planId="plan-1" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Packing reminders')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /note items/i })).toBeInTheDocument();
  });

  it('shows a loading spinner while items are undefined', () => {
    vi.mocked(useLiveQuery).mockReturnValue(undefined);
    render(
      <MemoryRouter>
        <ClipboardTab planId="plan-1" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });
});
