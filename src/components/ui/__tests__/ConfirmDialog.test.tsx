import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from '../ConfirmDialog';

const answered = vi.fn();

function Trigger({ tone }: { tone?: 'default' | 'danger' }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => answered(await confirm({
        title: 'Delete the plan?',
        body: 'This cannot be undone.',
        confirmLabel: 'Delete it',
        tone,
      }))}
    >
      go
    </button>
  );
}

const open = (tone?: 'default' | 'danger') => {
  render(<ConfirmProvider><Trigger tone={tone} /></ConfirmProvider>);
  fireEvent.click(screen.getByText('go'));
  return screen.findByTestId('confirm-dialog');
};

/*
 * This was window.confirm, which looks like a browser security warning rather
 * than part of the app, cannot say anything in more than one weight of plain
 * text, and may be suppressed outright by an installed PWA — in which case a
 * destructive action either proceeds unasked or silently does nothing.
 */
describe('asking before something irreversible', () => {
  it('says what will happen, in the app itself', async () => {
    const dialog = await open();
    expect(dialog).toHaveTextContent('Delete the plan?');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    expect(screen.getByTestId('confirm-accept')).toHaveTextContent('Delete it');
  });

  // The promise shape is what let every call site keep its existing flow
  // instead of being turned inside out into callbacks.
  it('resolves true when accepted', async () => {
    await open();
    fireEvent.click(screen.getByTestId('confirm-accept'));
    await waitFor(() => expect(answered).toHaveBeenCalledWith(true));
  });

  it('resolves false when cancelled', async () => {
    await open();
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    await waitFor(() => expect(answered).toHaveBeenCalledWith(false));
  });

  // Dismissing by any route is a "no": the safe answer is the one that does
  // nothing.
  it('treats clicking away as a no', async () => {
    await open();
    fireEvent.click(screen.getByTestId('confirm-backdrop'));
    await waitFor(() => expect(answered).toHaveBeenCalledWith(false));
  });

  it('treats Escape as a no', async () => {
    const dialog = await open();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(answered).toHaveBeenCalledWith(false));
  });

  it('closes once answered', async () => {
    await open();
    fireEvent.click(screen.getByTestId('confirm-accept'));
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument());
  });

  it('announces itself as a decision, not a passive dialog', async () => {
    await open();
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Delete the plan?');
  });
});

// A provider that silently auto-confirmed would turn "are you sure?" into
// "yes" for every destructive action in the app.
describe('without the provider', () => {
  it('refuses to run rather than assuming an answer', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ConfirmProvider/);
    quiet.mockRestore();
  });
});
