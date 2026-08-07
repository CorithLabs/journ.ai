import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryView from '../ItineraryView';
import { db, type Plan } from '../../../db';
import { setViewport, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');
vi.mock('../../../db', async () => {
  const actual = await vi.importActual<typeof import('../../../db')>('../../../db');
  return {
    ...actual,
    db: {
      ...actual.db,
      plans: { update: vi.fn().mockResolvedValue(1) },
      todos: { where: () => ({ equals: () => ({ toArray: async () => [] }) }), add: vi.fn() },
      clipboard: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    },
  };
});

const planWith = (times: string[]): Plan => ({
  id: 'p1', name: 'Tokyo', destination: 'Tokyo', country: 'Japan',
  startDate: '2025-07-14', endDate: '2025-07-15',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [{
    dayIndex: 0, label: 'Day 1 — Mon 14 Jul',
    activities: times.map((t, i) => ({
      id: `a${i}`, name: `Act ${i}`, time: t, locationName: '', notes: '', pinnedToTodo: false,
    })),
  }],
});

/** The itinerary the update was persisted with. */
const persisted = () => {
  const call = vi.mocked(db.plans.update).mock.calls.slice(-1)[0];
  return (call[1] as { itinerary: Plan['itinerary'] }).itinerary[0].activities;
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
  setViewport(DESKTOP);
});
afterEach(() => vi.unstubAllGlobals());

describe('parts of the day on a card', () => {
  // The user's example: a 3pm check-in copied off a booking should read as
  // Noon without anyone filing it there.
  it('shows an exact time under its part of the day', () => {
    render(<ItineraryView plan={planWith(['15:00'])} />);
    expect(screen.getByTestId('activity-time')).toHaveTextContent('Noon');
  });

  // Bucketing must not swallow the one detail you cannot miss.
  it('keeps the clock time beside the label', () => {
    render(<ItineraryView plan={planWith(['15:00'])} />);
    expect(screen.getByTestId('activity-exact-time')).toHaveTextContent('3:00 PM');
  });

  it('shows nothing extra for an activity that only has a slot', () => {
    render(<ItineraryView plan={planWith(['evening'])} />);
    expect(screen.getByTestId('activity-time')).toHaveTextContent('Evening');
    expect(screen.queryByTestId('activity-exact-time')).not.toBeInTheDocument();
  });
});

describe('moving a card through the day', () => {
  it('moves it into the next part of the day', async () => {
    render(<ItineraryView plan={planWith(['morning', 'evening'])} />);
    fireEvent.click(screen.getByLabelText('Move Act 0 down'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(persisted().find(a => a.id === 'a0')!.time).toBe('evening');
  });

  // Within a slot there is no clock to change, so the cards trade places and
  // the time is left alone.
  it('reorders within a part of the day without changing the time', async () => {
    render(<ItineraryView plan={planWith(['evening', 'evening'])} />);
    fireEvent.click(screen.getByLabelText('Move Act 1 up'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    const out = persisted();
    expect(out.map(a => a.id)).toEqual(['a1', 'a0']);
    expect(out.every(a => a.time === 'evening')).toBe(true);
  });

  /*
   * A clock-based sort could not do this: a nominal card moved down past a
   * card with an exact time in the target slot stayed stuck above it, and
   * pressing down again did nothing at all.
   */
  it('lands below a neighbour that has an exact time', async () => {
    render(<ItineraryView plan={planWith(['morning', '15:00'])} />);
    fireEvent.click(screen.getByLabelText('Move Act 0 down'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    const out = persisted();
    expect(out.map(a => a.id)).toEqual(['a1', 'a0']);
    expect(out.find(a => a.id === 'a0')!.time).toBe('noon');
  });

  it('does not offer a move off either end of the day', () => {
    render(<ItineraryView plan={planWith(['morning', 'night'])} />);
    expect(screen.getByLabelText('Move Act 0 up')).toBeDisabled();
    expect(screen.getByLabelText('Move Act 1 down')).toBeDisabled();
  });
});
