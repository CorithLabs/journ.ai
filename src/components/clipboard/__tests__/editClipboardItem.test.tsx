import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ClipboardItemDetail from '../ClipboardItemDetail';
import { db, type ClipboardItem } from '../../../db';

vi.mock('dexie-react-hooks');

const item: ClipboardItem = {
  id: 'c1', planId: 'p1', type: 'Hotel', title: 'Auberge booking',
  body: 'Confirmation 4471', createdAt: '', updatedAt: '',
};

const show = (search = '', over: Partial<ClipboardItem> = {}) => {
  vi.mocked(useLiveQuery).mockImplementation((fn: () => unknown) => {
    const out = fn();
    // The component asks for the item first, then the plan.
    return out === undefined ? { ...item, ...over } : out;
  });
  return render(
    <MemoryRouter initialEntries={[`/plan/p1/clipboard/c1${search}`]}>
      <Routes>
        <Route path="/plan/:planId/clipboard/:itemId" element={<ClipboardItemDetail planId="p1" />} />
      </Routes>
    </MemoryRouter>,
  );
};

const written = () => vi.mocked(db.clipboard.update).mock.calls.slice(-1)[0][1] as Partial<ClipboardItem>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(db.clipboard, 'update').mockResolvedValue(1);
});

/*
 * A clipboard item's own content could not be changed anywhere in the app.
 * This view showed the title as a heading and the body as a paragraph, and
 * wrote nothing but the itinerary link — so a typo in a confirmation, or a
 * note that needed a line adding, meant deleting the item and saving it again,
 * losing the attached file with it. The card's Edit button led here and did
 * nothing, which is worse than not offering one.
 */
describe('editing a clipboard item', () => {
  it('offers an edit control', () => {
    show();
    expect(screen.getByTestId('detail-edit-btn')).toBeInTheDocument();
  });

  it('opens with what the item already says', () => {
    show();
    fireEvent.click(screen.getByTestId('detail-edit-btn'));
    expect(screen.getByTestId('detail-title-input')).toHaveValue('Auberge booking');
    expect(screen.getByTestId('detail-body-input')).toHaveValue('Confirmation 4471');
    expect(screen.getByTestId('detail-type-select')).toHaveValue('Hotel');
  });

  it('saves the title, notes and type', async () => {
    show();
    fireEvent.click(screen.getByTestId('detail-edit-btn'));
    fireEvent.change(screen.getByTestId('detail-title-input'), { target: { value: 'Auberge — room 12' } });
    fireEvent.change(screen.getByTestId('detail-body-input'), { target: { value: 'Door code 8842' } });
    fireEvent.change(screen.getByTestId('detail-type-select'), { target: { value: 'Note' } });
    fireEvent.click(screen.getByTestId('detail-save-btn'));

    await waitFor(() => expect(db.clipboard.update).toHaveBeenCalled());
    expect(written()).toMatchObject({ title: 'Auberge — room 12', body: 'Door code 8842', type: 'Note' });
  });

  // Losing the title is losing the item: nothing else identifies it in a list.
  it('refuses to save it without a title', () => {
    show();
    fireEvent.click(screen.getByTestId('detail-edit-btn'));
    fireEvent.change(screen.getByTestId('detail-title-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('detail-save-btn'));
    expect(screen.getByTestId('detail-edit-error')).toBeInTheDocument();
    expect(db.clipboard.update).not.toHaveBeenCalled();
  });

  it('writes nothing on cancel', () => {
    show();
    fireEvent.click(screen.getByTestId('detail-edit-btn'));
    fireEvent.change(screen.getByTestId('detail-title-input'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByTestId('detail-cancel-btn'));
    expect(db.clipboard.update).not.toHaveBeenCalled();
    expect(screen.queryByTestId('detail-editor')).not.toBeInTheDocument();
  });

  // Re-uploading a boarding pass to fix a typo in its title would be absurd.
  it('leaves the attachment alone', async () => {
    show('', { fileName: 'boarding-pass.pdf' });
    fireEvent.click(screen.getByTestId('detail-edit-btn'));
    expect(screen.getByTestId('detail-editor')).toHaveTextContent('boarding-pass.pdf stays attached');
    fireEvent.click(screen.getByTestId('detail-save-btn'));
    await waitFor(() => expect(db.clipboard.update).toHaveBeenCalled());
    expect(written()).not.toHaveProperty('fileBlob');
    expect(written()).not.toHaveProperty('fileName');
  });
});

describe('arriving from a card', () => {
  // Landing on a read-only page after pressing a pencil is the bug this fixes.
  it('opens straight into the editor', () => {
    show('?edit=1');
    expect(screen.getByTestId('detail-editor')).toBeInTheDocument();
    expect(screen.getByTestId('detail-title-input')).toHaveValue('Auberge booking');
  });

  it('opens read-only without the flag', () => {
    show();
    expect(screen.queryByTestId('detail-editor')).not.toBeInTheDocument();
  });
});

describe('an item with no notes', () => {
  // Otherwise there is nothing on screen to click to add some.
  it('offers a way to add them', () => {
    show('', { body: undefined });
    fireEvent.click(screen.getByTestId('detail-add-notes'));
    expect(screen.getByTestId('detail-body-input')).toBeInTheDocument();
  });
});
