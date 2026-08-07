import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryView from '../ItineraryView';
import type { Plan } from '../../../db';
import { setViewport, PHONE, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

const plan: Plan = {
  id: 'p1', name: 'Tokyo', destination: 'Tokyo', country: 'Japan',
  startDate: '2025-07-14', endDate: '2025-07-15',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [{
    dayIndex: 0, label: 'Day 1 — Mon 14 Jul',
    activities: [{ id: 'a1', name: 'Museum', time: '10:00', locationName: '', notes: '', pinnedToTodo: false }],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * Inline, the add form sits directly above the on-screen keyboard when the day
 * is long — the keyboard covers it the moment the field is focused, so the
 * user cannot see what they are typing.
 */
describe('adding an activity on a phone', () => {
  it('opens a dialog anchored to the top of the screen', () => {
    setViewport(PHONE);
    render(<ItineraryView plan={plan} />);
    fireEvent.click(screen.getByText('Add activity'));
    const dialog = screen.getByTestId('add-activity-dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.className).toContain('top-4');
    expect(dialog.className).toContain('fixed');
  });

  it('names the day it is adding to', () => {
    setViewport(PHONE);
    render(<ItineraryView plan={plan} />);
    fireEvent.click(screen.getByText('Add activity'));
    expect(screen.getByTestId('add-activity-dialog')).toHaveTextContent('Day 1');
  });

  it('stays inline on desktop, where there is no keyboard to dodge', () => {
    setViewport(DESKTOP);
    render(<ItineraryView plan={plan} />);
    fireEvent.click(screen.getByText('Add activity'));
    expect(screen.queryByTestId('add-activity-dialog')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Activity name')).toBeInTheDocument();
  });

  it('warns before creating a second activity at the same time', () => {
    setViewport(DESKTOP);
    render(<ItineraryView plan={plan} />);
    fireEvent.click(screen.getByText('Add activity'));
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } });
    expect(screen.getByTestId('add-time-clash')).toHaveTextContent('Museum');
  });
});

const threeActs: Plan = {
  ...plan,
  itinerary: [{
    dayIndex: 0, label: 'Day 1 — Mon 14 Jul',
    activities: [
      { id: 'a1', name: 'Museum', time: '10:00', locationName: '', notes: '', pinnedToTodo: false },
      { id: 'a2', name: 'Lunch', time: '12:00', locationName: '', notes: '', pinnedToTodo: false },
      { id: 'a3', name: 'Park', time: '16:00', locationName: '', notes: '', pinnedToTodo: false },
    ],
  }],
};

/**
 * Without this, adding something mid-afternoon means "add at the bottom, set
 * the time, then move it up past everything else".
 */
describe('inserting between two cards', () => {
  it('puts a + in every gap, and only between cards', () => {
    setViewport(DESKTOP);
    render(<ItineraryView plan={threeActs} />);
    expect(screen.getAllByTestId('add-activity-gap')).toHaveLength(2);
  });

  it('has no gap button on a single-activity day', () => {
    setViewport(DESKTOP);
    render(<ItineraryView plan={plan} />);
    expect(screen.queryByTestId('add-activity-gap')).not.toBeInTheDocument();
  });

  it('names the pair it sits between, for screen readers', () => {
    setViewport(DESKTOP);
    render(<ItineraryView plan={threeActs} />);
    expect(screen.getByLabelText('Add activity between Museum and Lunch')).toBeInTheDocument();
  });

  // The point of tapping *that* gap: the time should already be in it.
  it('pre-fills a time inside the gap', () => {
    setViewport(DESKTOP);
    render(<ItineraryView plan={threeActs} />);
    fireEvent.click(screen.getByLabelText('Add activity between Lunch and Park'));
    expect(screen.getByLabelText('Time')).toHaveValue('14:00');
  });

  it('offers a time after the last activity at the end of the day', () => {
    setViewport(DESKTOP);
    render(<ItineraryView plan={threeActs} />);
    fireEvent.click(screen.getByText('Add activity'));
    expect(screen.getByLabelText('Time')).toHaveValue('17:00');
  });

  it('opens the top dialog on a phone', () => {
    setViewport(PHONE);
    render(<ItineraryView plan={threeActs} />);
    fireEvent.click(screen.getByLabelText('Add activity between Museum and Lunch'));
    expect(screen.getByTestId('add-activity-dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Time')).toHaveValue('11:00');
  });
});
