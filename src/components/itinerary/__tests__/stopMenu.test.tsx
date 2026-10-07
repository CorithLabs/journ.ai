import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/render';
import StopMenu from '../StopMenu';

const show = (over: Partial<Parameters<typeof StopMenu>[0]> = {}) => {
  const props = {
    name: 'Meiji Shrine',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Meiji',
    pinned: false,
    onPin: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    ...over,
  };
  render(<StopMenu {...props} />);
  return props;
};
const open = () => fireEvent.click(screen.getByRole('button', { name: 'More actions for Meiji Shrine' }));

describe("a stop's menu", () => {
  // One control per stop, always there: no hover to find it on a phone.
  it('is one button, closed until asked', () => {
    show();
    expect(screen.getByRole('button', { name: 'More actions for Meiji Shrine' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('says what each action does, in words', () => {
    show();
    open();
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Directions');
    expect(menu).toHaveTextContent('Pin to to-do');
    expect(menu).toHaveTextContent('Edit');
    expect(menu).toHaveTextContent('Move earlier');
    expect(menu).toHaveTextContent('Move later');
    expect(menu).toHaveTextContent('Delete');
  });

  it('does what was chosen, and closes', () => {
    const p = show();
    open();
    fireEvent.click(screen.getByLabelText('Delete activity'));
    expect(p.onDelete).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('says unpin for a stop already pinned', () => {
    show({ pinned: true });
    open();
    expect(screen.getByLabelText('Unpin from to-do')).toHaveTextContent('Unpin from to-do');
  });

  it('cannot move a stop off either end of the day', () => {
    show({ onMoveUp: undefined });
    open();
    expect(screen.getByLabelText('Move Meiji Shrine up')).toBeDisabled();
    expect(screen.getByLabelText('Move Meiji Shrine down')).not.toBeDisabled();
  });

  it('has no directions for a stop with nowhere to go', () => {
    show({ mapsUrl: null });
    open();
    expect(screen.queryByText('Directions')).not.toBeInTheDocument();
  });

  describe('from the keyboard', () => {
    it('focuses the first action, moves with the arrows, and Escape goes back to the button', () => {
      show();
      open();
      expect(document.activeElement).toHaveTextContent('Directions');
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
      expect(document.activeElement).toHaveTextContent('Pin to to-do');
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
      expect(document.activeElement).toHaveTextContent('Delete');
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for Meiji Shrine' }));
    });
  });

  it('closes when you tap elsewhere', () => {
    show();
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
