import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryView from '../ItineraryView';
import type { Plan } from '../../../db';
import { setViewport, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

const plan: Plan = {
  id: 'p1', name: 'Percé', destination: 'Percé', country: 'Canada',
  startDate: '2025-08-01', endDate: '2025-08-05',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [0, 1, 2, 3, 4].map(i => ({
    dayIndex: i, label: `Day ${i + 1}`,
    activities: [{ id: `a${i}`, name: `Stop ${i}`, time: 'morning', locationName: '', notes: '', pinnedToTodo: false }],
  })),
};

/** Freeze the clock at a local noon, the way a device reports the user's day. */
const onDay = (iso: string) => vi.setSystemTime(new Date(`${iso}T12:00:00`));

const show = () => render(<MemoryRouter><ItineraryView plan={plan} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setViewport(DESKTOP);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/*
 * The app knew today's date and the dates of the trip, and used neither.
 * Someone standing in Percé on day four opened on day one and scrolled.
 */
describe('a trip that is happening now', () => {
  it('marks which day is today', () => {
    onDay('2025-08-03');
    show();
    expect(screen.getByTestId('day-relative-2')).toHaveTextContent('Today');
    expect(screen.getByTestId('today-section')).toHaveAccessibleName(/today/i);
  });

  it('says where the trip has got to', () => {
    onDay('2025-08-03');
    show();
    expect(screen.getByTestId('trip-timing')).toHaveTextContent('Day 3 of your trip');
    expect(screen.getByTestId('trip-timing')).toHaveTextContent('3 days to go');
  });

  it('offers a way back to today after looking elsewhere', () => {
    onDay('2025-08-03');
    show();
    const scrollTo = vi.fn();
    document.getElementById('day-2')!.scrollIntoView = scrollTo;
    fireEvent.click(screen.getByTestId('jump-to-today'));
    expect(scrollTo).toHaveBeenCalled();
  });

  it('names the days either side of today', () => {
    onDay('2025-08-03');
    show();
    expect(screen.getByTestId('day-relative-3')).toHaveTextContent('Tomorrow');
    expect(screen.getByTestId('day-relative-1')).toHaveTextContent('Yesterday');
  });

  // "In 4 days" on every remaining row is noise, not information.
  it('leaves the rest unlabelled', () => {
    onDay('2025-08-01');
    show();
    expect(screen.queryByTestId('day-relative-4')).not.toBeInTheDocument();
  });
});

describe('a trip that is not happening now', () => {
  it('counts down to one still ahead', () => {
    onDay('2025-07-29');
    show();
    expect(screen.getByTestId('trip-timing')).toHaveTextContent('Starts in 3 days');
    expect(screen.queryByTestId('jump-to-today')).not.toBeInTheDocument();
  });

  it('says when a trip has ended', () => {
    onDay('2025-08-10');
    show();
    expect(screen.getByTestId('trip-timing')).toHaveTextContent('ended');
    expect(screen.queryByTestId('today-section')).not.toBeInTheDocument();
  });

  it('marks nothing as today', () => {
    onDay('2025-07-29');
    show();
    expect(screen.queryByTestId('today-section')).not.toBeInTheDocument();
  });

  it('stays quiet when the dates say nothing', () => {
    onDay('2025-08-03');
    render(<MemoryRouter><ItineraryView plan={{ ...plan, startDate: '', endDate: '' }} /></MemoryRouter>);
    expect(screen.queryByTestId('trip-timing')).not.toBeInTheDocument();
  });
});
