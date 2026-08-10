import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryView from '../ItineraryView';
import type { Plan, ClipboardItem } from '../../../db';
import { setViewport, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

const plan: Plan = {
  id: 'p1', name: 'Percé', destination: 'Percé', country: 'Canada',
  startDate: '2025-08-01', endDate: '2025-08-03',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [
    {
      dayIndex: 0, label: 'Day 1',
      activities: [
        { id: 'a1', name: 'Morning walk', time: 'morning', locationName: '', notes: '', pinnedToTodo: false },
        { id: 'a2', name: 'Evening meal', time: 'evening', locationName: '', notes: '', pinnedToTodo: false },
      ],
    },
    { dayIndex: 1, label: 'Day 2', activities: [] },
  ],
};

const clip = (over: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: 'c1', planId: 'p1', type: 'Hotel', title: 'Auberge check-in',
  createdAt: '', updatedAt: '', ...over,
});

const show = (items: ClipboardItem[]) => {
  vi.mocked(useLiveQuery).mockReturnValue(items);
  return render(<MemoryRouter><ItineraryView plan={plan} /></MemoryRouter>);
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setViewport(DESKTOP);
});
afterEach(() => vi.unstubAllGlobals());

/*
 * Linking a hotel confirmation to day three recorded the link and showed it
 * nowhere. The itinerary for that day said nothing about a check-in, and the
 * only way to find it was to remember it existed and go looking.
 */
describe('a clipboard item linked to a day', () => {
  it('appears on that day', () => {
    show([clip({ linkedDayIndex: 0, time: '15:00' })]);
    expect(screen.getByTestId('linked-clipboard-card')).toHaveTextContent('Auberge check-in');
  });

  it('stays off the days it is not linked to', () => {
    show([clip({ linkedDayIndex: 1, time: '15:00' })]);
    const day1 = screen.getByLabelText('Day 1');
    expect(day1).not.toContainElement(screen.getByTestId('linked-clipboard-card'));
  });

  it('is not shown at all when it is linked to nothing', () => {
    show([clip()]);
    expect(screen.queryByTestId('linked-clipboard-card')).not.toBeInTheDocument();
  });

  // 3pm is Noon, the same normalisation an activity gets.
  it('shows an exact time under its part of the day, keeping the clock', () => {
    show([clip({ linkedDayIndex: 0, time: '15:00' })]);
    const card = screen.getByTestId('linked-clipboard-card');
    expect(card).toHaveTextContent('Noon');
    expect(card).toHaveTextContent('3:00 PM');
  });

  it('shows a slot on its own without inventing a clock time', () => {
    show([clip({ linkedDayIndex: 0, time: 'evening' })]);
    const card = screen.getByTestId('linked-clipboard-card');
    expect(card).toHaveTextContent('Evening');
    expect(card).not.toHaveTextContent(/\d:\d\d/);
  });

  it('opens the item in the clipboard', () => {
    show([clip({ linkedDayIndex: 0, time: '15:00' })]);
    expect(screen.getByLabelText(/open in clipboard/i)).toBeInTheDocument();
  });

  // A day whose only content is a booking is not an empty day.
  it('counts as content on a day with no activities', () => {
    show([clip({ linkedDayIndex: 1, time: '15:00' })]);
    const day2 = screen.getByLabelText('Day 2');
    expect(day2).not.toHaveTextContent('No activities yet');
    expect(day2).toContainElement(screen.getByTestId('linked-clipboard-card'));
  });

  it('still lists an item that has no time of its own', () => {
    show([clip({ linkedDayIndex: 0 })]);
    expect(screen.getByTestId('linked-clipboard-card')).toBeInTheDocument();
  });

  it('shows each linked item once, not once per activity', () => {
    show([clip({ linkedDayIndex: 0, time: 'morning' })]);
    expect(screen.getAllByTestId('linked-clipboard-card')).toHaveLength(1);
  });

  it('shows several items on the same day', () => {
    show([
      clip({ id: 'c1', title: 'Check-in', linkedDayIndex: 0, time: '15:00' }),
      clip({ id: 'c2', title: 'Ferry ticket', linkedDayIndex: 0, time: 'morning' }),
    ]);
    expect(screen.getAllByTestId('linked-clipboard-card')).toHaveLength(2);
  });

  // The itinerary is worth rendering before the clipboard has loaded.
  it('renders the day while the clipboard query is still in flight', () => {
    vi.mocked(useLiveQuery).mockReturnValue(undefined);
    render(<MemoryRouter><ItineraryView plan={plan} /></MemoryRouter>);
    expect(screen.getByTestId('itinerary-view')).toBeInTheDocument();
  });
});
