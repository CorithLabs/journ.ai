import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NewPlanModal from '../NewPlanModal';
import { db, type Plan, type TodoItem } from '../../../db';
import { lookupCity, type City } from '../../../services/cityLookup';
import { guessOrigin, locateOrigin, LocationError } from '../../../services/origin';

vi.mock('../../../services/destinations', async () => {
  const actual = await vi.importActual<typeof import('../../../services/destinations')>('../../../services/destinations');
  return { ...actual, searchDestinations: vi.fn(async () => []) };
});
vi.mock('../../../services/cityLookup', () => ({ lookupCity: vi.fn() }));
vi.mock('../../../services/origin', async () => {
  const actual = await vi.importActual<typeof import('../../../services/origin')>('../../../services/origin');
  return { ...actual, guessOrigin: vi.fn(), locateOrigin: vi.fn() };
});

const city = (name: string, country: string, countryCode: string, lng: number, lat: number): City => ({
  name, region: null, country, countryCode, coordinates: [lng, lat], label: `${name}, ${country}`,
});
const CITIES: Record<string, City> = {
  'toronto, canada': city('Toronto', 'Canada', 'CA', -79.38, 43.65),
  'tokyo, japan': city('Tokyo', 'Japan', 'JP', 139.69, 35.69),
  'montreal, canada': city('Montreal', 'Canada', 'CA', -73.57, 45.5),
};

const created = () => vi.mocked(db.plans.add).mock.calls[0][0] as Plan;
const todos = () => (vi.mocked(db.todos.bulkAdd).mock.calls[0]?.[0] ?? []) as TodoItem[];

const show = async () => {
  render(<MemoryRouter><NewPlanModal onClose={vi.fn()} /></MemoryRouter>);
  // Let the time-zone guess land.
  await act(async () => {});
};

const goTo = async (place: string) => {
  fireEvent.change(screen.getByTestId('destination-input'), { target: { value: place } });
  fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2026-11-07' } });
  fireEvent.change(screen.getByTestId('end-date-input'), { target: { value: '2026-11-14' } });
  // The places are looked up after a pause, for the distance between them.
  await act(async () => { await new Promise((r) => setTimeout(r, 650)); });
};

const create = async () => {
  fireEvent.click(screen.getByTestId('create-plan-btn'));
  await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(db.plans.add).mockResolvedValue('p1');
  vi.mocked(lookupCity).mockImplementation(async (q: string) => CITIES[q.trim().toLowerCase()] ?? null);
  vi.mocked(guessOrigin).mockResolvedValue(CITIES['toronto, canada']);
});

describe('where the trip starts', () => {
  it('suggests the city of the device time zone, and says so', async () => {
    await show();
    expect(screen.getByTestId('origin-input')).toHaveValue('Toronto, Canada');
    expect(screen.getByTestId('origin-note')).toHaveTextContent('Suggested from your time zone');
  });

  // Only on request: a permission prompt on opening is mostly refused.
  it('asks for the location only when "Use my location" is tapped', async () => {
    vi.mocked(locateOrigin).mockResolvedValue(city('Mississauga', 'Canada', 'CA', -79.64, 43.59));
    await show();
    expect(locateOrigin).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByTestId('use-my-location')); });
    expect(screen.getByTestId('origin-input')).toHaveValue('Mississauga, Canada');
    expect(screen.getByTestId('origin-note')).toHaveTextContent('Your location');
  });

  it('says why when the location cannot be had', async () => {
    vi.mocked(locateOrigin).mockRejectedValue(new LocationError('Location is turned off for this site.'));
    await show();
    await act(async () => { fireEvent.click(screen.getByTestId('use-my-location')); });
    expect(screen.getByTestId('origin-note')).toHaveTextContent('Location is turned off for this site.');
  });

  it('keeps it with the trip', async () => {
    await show();
    await goTo('Tokyo, Japan');
    await create();
    expect(created().origin).toMatchObject({ label: 'Toronto, Canada', city: 'Toronto', countryCode: 'CA' });
  });
});

describe('getting there', () => {
  it('offers only a flight across an ocean, the rest a tap away', async () => {
    await show();
    await goTo('Tokyo, Japan');
    expect(screen.getByTestId('mode-flight')).toBeInTheDocument();
    expect(screen.queryByTestId('mode-car')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('more-modes'));
    expect(screen.getByTestId('mode-car')).toBeInTheDocument();
  });

  it('offers the train first a few hours away', async () => {
    await show();
    await goTo('Montreal, Canada');
    const offered = screen.getByTestId('mode').querySelectorAll('button');
    expect(offered[0]).toHaveAttribute('data-testid', 'mode-train');
  });

  it('works out whether the trip crosses a border', async () => {
    await show();
    await goTo('Tokyo, Japan');
    await create();
    expect(created().international).toBe(true);
  });
});

describe('tickets', () => {
  it('asks whether they are booked, for a mode with tickets', async () => {
    await show();
    await goTo('Tokyo, Japan');
    expect(screen.queryByTestId('tickets-question')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mode-flight'));
    expect(screen.getByTestId('tickets-question')).toHaveTextContent('Are your flights booked?');
  });

  it('does not ask for a road trip', async () => {
    await show();
    await goTo('Montreal, Canada');
    fireEvent.click(screen.getByTestId('mode-car'));
    expect(screen.queryByTestId('tickets-question')).not.toBeInTheDocument();
  });

  // Booked: the dates and times go on the trip, and a place to keep the tickets.
  it('records the flights when booked, and makes room for the tickets', async () => {
    await show();
    await goTo('Tokyo, Japan');
    fireEvent.click(screen.getByTestId('mode-flight'));
    fireEvent.click(screen.getByTestId('tickets-booked-yes'));
    expect(screen.getByTestId('out-date')).toHaveValue('2026-11-07');
    expect(screen.getByTestId('ret-date')).toHaveValue('2026-11-14');
    fireEvent.change(screen.getByTestId('out-time'), { target: { value: '06:40' } });
    fireEvent.change(screen.getByTestId('ret-time'), { target: { value: '18:15' } });
    await create();
    expect(created().arrival).toMatchObject({ mode: 'flight', date: '2026-11-07', time: '06:40' });
    expect(created().departure).toMatchObject({ mode: 'flight', date: '2026-11-14', time: '18:15' });
    expect(created().booked).toEqual({ travel: true, stay: false });
    expect(todos().map((t) => t.title)).toContain('Save your flight tickets');
  });

  // Not yet: a task to book them, worded for the mode.
  it('adds a task to book them when they are not', async () => {
    await show();
    await goTo('Tokyo, Japan');
    fireEvent.click(screen.getByTestId('mode-flight'));
    fireEvent.click(screen.getByTestId('tickets-booked-no'));
    await create();
    expect(todos().map((t) => t.title)).toContain('Book flights to Tokyo, Japan');
    expect(created().arrival?.time).toBeUndefined();
    expect(created().booked?.travel).toBe(false);
  });

  it('records a one-way trip without a way home', async () => {
    await show();
    await goTo('Tokyo, Japan');
    fireEvent.click(screen.getByTestId('mode-flight'));
    fireEvent.click(screen.getByTestId('round-trip'));
    await create();
    expect(created().arrival).toBeDefined();
    expect(created().departure).toBeUndefined();
  });
});

/*
 * Round trip sits beside the dates, on by default. Off, the end date slides
 * away: a one-way trip has none to ask for.
 */
describe('round trip or one way', () => {
  it('is a round trip by default, with both dates', async () => {
    await show();
    expect(screen.getByTestId('round-trip')).toBeChecked();
    expect(screen.getByTestId('end-date-input')).toBeEnabled();
    expect(screen.getByTestId('trip-dates')).toHaveStyle({ gridTemplateColumns: '1fr 1fr' });
  });

  it('folds the end date away for one way', async () => {
    await show();
    fireEvent.click(screen.getByTestId('round-trip'));
    expect(screen.getByTestId('end-date-input')).toBeDisabled();
    expect(screen.getByTestId('trip-dates')).toHaveStyle({ gridTemplateColumns: '1fr 0fr' });
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('makes a one-way trip one day, ignoring an end date set before', async () => {
    await show();
    await goTo('Tokyo, Japan');
    fireEvent.click(screen.getByTestId('round-trip'));
    await create();
    expect(created()).toMatchObject({ startDate: '2026-11-07', endDate: '2026-11-07' });
  });

  it('has no way home on the tickets for one way', async () => {
    await show();
    await goTo('Tokyo, Japan');
    fireEvent.click(screen.getByTestId('mode-flight'));
    fireEvent.click(screen.getByTestId('tickets-booked-yes'));
    expect(screen.getByTestId('ret-date')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('round-trip'));
    expect(screen.queryByTestId('ret-date')).not.toBeInTheDocument();
  });
});

describe('the stay', () => {
  it('can be skipped, and is then still to book', async () => {
    await show();
    await goTo('Tokyo, Japan');
    await create();
    expect(todos().map((t) => t.title)).toContain('Book accommodation for each night');
  });

  it('gets a place for the booking when it is booked', async () => {
    await show();
    await goTo('Tokyo, Japan');
    fireEvent.click(screen.getByTestId('stay-booked-yes'));
    await create();
    expect(todos().map((t) => t.title)).toEqual(['Save your hotel booking']);
  });
});
