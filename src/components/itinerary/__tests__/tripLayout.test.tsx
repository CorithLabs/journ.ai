import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryView from '../ItineraryView';
import { dateRange } from '../../../utils/dateText';
import { useAppStore, type WeatherDay } from '../../../store';
import type { Plan } from '../../../db';
import { setViewport, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

const base: WeatherDay = {
  date: '', weatherCode: 1, tempMax: 21, tempMin: 12,
  precipProbability: 10, windspeedMax: 15, apparentTempMax: 21,
};
const wet = { ...base, date: '2026-10-10', weatherCode: 63, precipProbability: 70, tempMax: 18 };
const windy = { ...base, date: '2026-10-11', windspeedMax: 56 };
const fine = { ...base, date: '2026-10-09' };

const act = (id: string, name: string) => ({
  id, name, time: 'morning', locationName: '', notes: '', pinnedToTodo: false,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1', name: 'Tokyo Explorer', destination: 'Tokyo, Japan',
  startDate: '2026-10-09', endDate: '2026-10-11',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [
    { dayIndex: 0, label: 'Day 1 — Arrival', activities: [act('a0', 'Coastal hike')] },
    { dayIndex: 1, label: 'Day 2 — Culture', activities: [act('a1', 'Coastal hike'), act('a2', 'Art museum')] },
    { dayIndex: 2, label: 'Day 3 — Out', activities: [act('a3', 'Beach walk')] },
  ],
  ...over,
});

const show = (p: Plan = plan()) => render(<MemoryRouter><ItineraryView plan={p} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setViewport(DESKTOP);
  vi.mocked(useLiveQuery).mockReturnValue([]);
  useAppStore.setState({ weatherByDate: { '2026-10-09': fine, '2026-10-10': wet, '2026-10-11': windy } });
});
afterEach(() => {
  useAppStore.setState({ weatherByDate: null });
});

describe('the top of the trip', () => {
  it('names the trip and its dates', () => {
    show();
    const hero = screen.getByTestId('trip-hero');
    expect(within(hero).getByRole('heading', { name: 'Tokyo Explorer' })).toBeInTheDocument();
    expect(within(hero).getByText(/9–11 Oct 2026 · 2 nights/)).toBeInTheDocument();
  });

  it('says what the trip was planned around, when the traveller said', () => {
    show(plan({ intake: {
      numTravellers: 2, kids: false, kidAges: [], likes: ['street food', 'temples'], dislikes: ['crowds'],
      budgetRange: 'mid', flightsBooked: null, accommodationBooked: null,
    } }));
    expect(screen.getByText('Built around street food and temples, steering clear of crowds.')).toBeInTheDocument();
    expect(screen.getByText('2 travellers')).toBeInTheDocument();
  });

  it('puts a forecast tile on the photo for every day with weather', () => {
    show();
    expect(screen.getAllByTestId('hero-forecast-day')).toHaveLength(3);
  });
});

describe('weather on the photo', () => {
  it('raises one alert for each day something could be spoiled', () => {
    show();
    const alerts = screen.getAllByTestId('hero-weather-alert');
    expect(alerts.map((a) => a.dataset.hazard)).toEqual(['rain', 'wind']);
    expect(alerts[0]).toHaveTextContent('Rain likely · Sat 10');
    expect(alerts[1]).toHaveTextContent('High winds · Sun 11');
  });

  it('raises none on a fine trip', () => {
    useAppStore.setState({ weatherByDate: { '2026-10-09': fine } });
    show();
    expect(screen.queryByTestId('hero-weather-alert')).not.toBeInTheDocument();
  });

  it('takes you to the day an alert is about', () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scroll });
    show();
    fireEvent.click(screen.getAllByTestId('hero-weather-alert')[0]);
    expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById('day-1'));
  });
});

describe('weather on the day it affects', () => {
  it('bands the day in its hazard', () => {
    show();
    const bands = screen.getAllByTestId('weather-alert-badge');
    expect(bands.map((b) => b.dataset.hazard)).toEqual(['rain', 'wind']);
    expect(bands[0]).toHaveTextContent('1 outdoor stop affected');
  });

  // The museum is dry whatever the weather does.
  it('tags the outdoor stops and leaves the indoor ones alone', () => {
    show();
    const day = document.getElementById('day-1')!;
    const tags = within(day).getAllByTestId('activity-weather-tag');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toHaveTextContent('Outdoors · may be wet');
  });

  it('tags nothing on a fine day', () => {
    show();
    expect(within(document.getElementById('day-0')!).queryByTestId('activity-weather-tag')).not.toBeInTheDocument();
  });

  it('marks the day in the day bar too', () => {
    show();
    const bar = screen.getByRole('navigation', { name: 'Jump to a day' });
    expect(within(bar).getByRole('button', { name: 'Day 2, rain likely' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Day 3, high winds' })).toBeInTheDocument();
  });
});

describe('getting there and back', () => {
  it('shows the legs the traveller filled in', () => {
    show(plan({
      arrival: { city: 'Tokyo', airport: 'Narita International (NRT)', date: '2026-10-09', time: '15:40', mode: 'flight' },
      departure: { city: 'Tokyo', airport: 'Haneda (HND)', date: '2026-10-12', mode: 'flight' },
    }));
    expect(screen.getByTestId('transport-arrival')).toHaveTextContent('Arrive · Narita International (NRT)');
    expect(screen.getByTestId('transport-arrival')).toHaveTextContent('3:40 PM');
    // A leg with no time says so, rather than leaving a gap.
    expect(screen.getByTestId('transport-departure')).toHaveTextContent('Time not set');
  });

  it('is left out until there is something to show', () => {
    show();
    expect(screen.queryByTestId('transport-strip')).not.toBeInTheDocument();
  });
});

describe('trip dates', () => {
  it('reads naturally across months and years', () => {
    expect(dateRange('2026-10-09', '2026-10-11')).toBe('9–11 Oct 2026');
    expect(dateRange('2026-09-28', '2026-10-03')).toBe('28 Sep – 3 Oct 2026');
    expect(dateRange('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
    expect(dateRange('2026-10-09', '2026-10-09')).toBe('9 Oct 2026');
  });
});
