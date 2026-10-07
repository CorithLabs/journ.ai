import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanContextMenu from '../PlanContextMenu';

const items = () => [
  { label: 'Duplicate', onSelect: vi.fn(), testId: 'trip-duplicate' },
  { label: 'Delete', onSelect: vi.fn(), danger: true, testId: 'trip-delete' },
];

describe('PlanContextMenu', () => {
  it('offers the actions it is given, Delete set apart in red', () => {
    render(<PlanContextMenu items={items()} x={10} y={10} onClose={vi.fn()} />);
    expect(screen.getByRole('menu', { name: 'Plan options' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Duplicate', 'Delete']);
    expect(screen.getByTestId('trip-delete').className).toContain('text-status-danger');
  });

  // It only offers the action; the sidebar carries it out, so what follows
  // (an Undo) is not lost when this menu closes.
  it('closes and hands the choice on', () => {
    const list = items();
    const onClose = vi.fn();
    render(<PlanContextMenu items={list} x={10} y={10} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('trip-delete'));
    expect(onClose).toHaveBeenCalled();
    expect(list[1].onSelect).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<PlanContextMenu items={items()} x={10} y={10} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
