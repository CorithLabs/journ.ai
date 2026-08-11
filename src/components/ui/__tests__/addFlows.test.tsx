import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TodoList from '../../todo/TodoList';
import ClipboardTab from '../../tabs/ClipboardTab';
import { db } from '../../../db';
import { setViewport, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

const show = (Comp: () => JSX.Element) => render(<MemoryRouter>{Comp()}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setViewport(DESKTOP);
  vi.mocked(useLiveQuery).mockReturnValue([]);
  vi.spyOn(db.todos, 'add').mockResolvedValue('t1');
});
afterEach(() => vi.unstubAllGlobals());

/*
 * Adding an activity opened a dialog, adding a to-do unfolded a form inside
 * the list, and adding a clipboard item slid a drawer in from the right. Three
 * ways to do one job, each with its own idea of how to leave.
 */
describe('adding a to-do', () => {
  it('offers the way in beside the list, not as a link in the header', () => {
    show(() => <TodoList planId="p1" />);
    const add = screen.getByTestId('add-task-btn');
    expect(add).toHaveTextContent('Add task');
    // Green, like the + between itinerary cards, against the red that removes.
    expect(add.className).toContain('text-status-success');
  });

  it('opens as a dialog', () => {
    show(() => <TodoList planId="p1" />);
    fireEvent.click(screen.getByTestId('add-task-btn'));
    expect(screen.getByTestId('modal')).toHaveAccessibleName('Add task');
  });

  // There was no way out of this form but pressing the trigger again.
  it('can be abandoned', () => {
    show(() => <TodoList planId="p1" />);
    fireEvent.click(screen.getByTestId('add-task-btn'));
    fireEvent.click(screen.getByTestId('cancel-task-btn'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    expect(db.todos.add).not.toHaveBeenCalled();
  });

  it('says Save, sized to the word', () => {
    show(() => <TodoList planId="p1" />);
    fireEvent.click(screen.getByTestId('add-task-btn'));
    const save = screen.getByTestId('save-task-btn');
    expect(save).toHaveTextContent('Save');
    expect(save.className).not.toContain('w-full');
  });

  it('still saves the task', async () => {
    show(() => <TodoList planId="p1" />);
    fireEvent.click(screen.getByTestId('add-task-btn'));
    fireEvent.change(screen.getByTestId('task-title-input'), { target: { value: 'Book the ferry' } });
    fireEvent.click(screen.getByTestId('save-task-btn'));
    await waitFor(() => expect(db.todos.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Book the ferry' }),
    ));
  });
});

describe('adding a clipboard item', () => {
  it('offers the same way in', () => {
    show(() => <ClipboardTab planId="p1" />);
    const add = screen.getByTestId('add-item-btn');
    expect(add).toHaveTextContent('Add item');
    expect(add.className).toContain('text-status-success');
  });

  // Was a drawer sliding in from the right — a third thing to learn.
  it('opens as the same dialog, not a drawer', () => {
    show(() => <ClipboardTab planId="p1" />);
    fireEvent.click(screen.getByTestId('add-item-btn'));
    expect(screen.getByTestId('modal')).toHaveAccessibleName('Add item');
  });

  it('can be abandoned', () => {
    show(() => <ClipboardTab planId="p1" />);
    fireEvent.click(screen.getByTestId('add-item-btn'));
    fireEvent.click(screen.getByTestId('cancel-item-btn'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('says Save, like the other two', () => {
    show(() => <ClipboardTab planId="p1" />);
    fireEvent.click(screen.getByTestId('add-item-btn'));
    expect(screen.getByTestId('save-item-btn')).toHaveTextContent('Save');
  });
});

describe('every dialog closes the same ways', () => {
  it('by its own close control', () => {
    show(() => <TodoList planId="p1" />);
    fireEvent.click(screen.getByTestId('add-task-btn'));
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('by clicking away from it', () => {
    show(() => <TodoList planId="p1" />);
    fireEvent.click(screen.getByTestId('add-task-btn'));
    fireEvent.click(screen.getByTestId('modal-scrim'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('by Escape', () => {
    show(() => <TodoList planId="p1" />);
    fireEvent.click(screen.getByTestId('add-task-btn'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  // A click inside must not count as a click away.
  it('but not by using what is inside it', () => {
    show(() => <TodoList planId="p1" />);
    fireEvent.click(screen.getByTestId('add-task-btn'));
    fireEvent.click(screen.getByTestId('task-title-input'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
