import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryView from '../ItineraryView';
import { useAppStore, type WeatherDay } from '../../../store';
import type { Plan } from '../../../db';
import { TEMP_UNIT_STORAGE } from '../../../services/units';
import { setViewport, DESKTOP } from '../../../test/viewport';
import { bookedDayIndexes } from '../../../utils/activityBookings';

vi.mock('dexie-react-hooks');

const wet: WeatherDay = {
  date: '2025-08-01', weatherCode: 65, tempMax: 14, tempMin: 9,
  precipProbability: 90, windspeedMax: 20, apparentTempMax: 12,
};
const fine: WeatherDay = { ...wet, date: '2025-08-02', weatherCode: 0, precipProbability: 5, tempMax: 22 };

const planWith = (day0: string[], day1: string[] = []): Plan => ({
  id: 'p1', name: 'Percé', destination: 'Percé', country: 'Canada',
  startDate: '2025-08-01', endDate: '2025-08-02',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [day0, day1].map((names, i) => ({
    dayIndex: i, label: `Day ${i + 1}`,
    activities: names.map((name, n) => ({
      id: `a${i}${n}`, name, time: 'morning', locationName: '', notes: '', pinnedToTodo: false,
    })),
  })),
});

const show = (plan: Plan) => render(<MemoryRouter><ItineraryView plan={plan} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setViewport(DESKTOP);
  vi.mocked(useLiveQuery).mockReturnValue([]);
  useAppStore.setState({ weatherByDate: { '2025-08-01': wet, '2025-08-02': fine } });
});
afterEach(() => {
  useAppStore.setState({ weatherByDate: null });
  vi.unstubAllGlobals();
});

/*
 * useWeather already fetched a forecast on every plan open and wrote it to
 * the store, where nothing read it. Three finished components sat unmounted
 * while the API calls went out anyway.
 */
describe('the forecast reaches the itinerary', () => {
  it('shows a day its own weather', () => {
    show(planWith(['Coastal hike']));
    expect(screen.getAllByTestId('weather-strip').length).toBeGreaterThan(0);
  });

  it('matches each day to its date rather than showing one everywhere', () => {
    useAppStore.setState({ weatherByDate: { '2025-08-02': fine } });
    show(planWith(['Coastal hike'], ['Museum']));
    expect(screen.getAllByTestId('weather-strip')).toHaveLength(1);
  });

  it('says nothing when there is no forecast', () => {
    useAppStore.setState({ weatherByDate: null });
    show(planWith(['Coastal hike']));
    expect(screen.queryByTestId('weather-strip')).not.toBeInTheDocument();
  });

  it('reads in Fahrenheit when that is the setting', () => {
    localStorage.setItem(TEMP_UNIT_STORAGE, 'F');
    show(planWith(['Coastal hike']));
    expect(screen.getAllByTestId('weather-strip')[0]).toHaveTextContent('°F');
  });

  it('reads in Celsius by default', () => {
    show(planWith(['Coastal hike']));
    expect(screen.getAllByTestId('weather-strip')[0]).toHaveTextContent('°C');
  });
});

describe('warning only when there is something to spoil', () => {
  it('warns about rain on a day spent outside', () => {
    show(planWith(['Coastal hike']));
    expect(screen.getByTestId('weather-alert-badge')).toBeInTheDocument();
  });

  // A warning that is wrong more often than right teaches people to ignore
  // the ones that are not.
  it('stays quiet about rain on a day spent indoors', () => {
    show(planWith(['Musée de la Gaspésie', 'Dinner at the restaurant']));
    expect(screen.queryByTestId('weather-alert-badge')).not.toBeInTheDocument();
  });

  it('stays quiet on a day with nothing planned', () => {
    show(planWith([]));
    expect(screen.queryByTestId('weather-alert-badge')).not.toBeInTheDocument();
  });

  it('stays quiet when the weather is fine', () => {
    useAppStore.setState({ weatherByDate: { '2025-08-01': { ...fine, date: '2025-08-01' } } });
    show(planWith(['Coastal hike']));
    expect(screen.queryByTestId('weather-alert-badge')).not.toBeInTheDocument();
  });
});

/*
 * A day holding a booked activity cannot be swapped: the table is reserved
 * for that evening. The prompt asked the AI to respect confirmed bookings and
 * passed it no booking data at all, so the instruction was unenforceable.
 */
describe('days that are already committed to', () => {
  const twoOutdoorDays = () => planWith(['Coastal hike'], ['Beach walk']);

  it('offers a swap when nothing is booked', () => {
    vi.mocked(useLiveQuery).mockReturnValue([]);
    show(twoOutdoorDays());
    expect(screen.getByTestId('weather-alert-badge')).toBeInTheDocument();
  });

  it('counts a clipboard item linked to a whole day as a booking', () => {
    const plan = twoOutdoorDays();
    expect(bookedDayIndexes(plan, [
      { id: 'c1', planId: 'p1', type: 'Hotel', title: 'Auberge', linkedDayIndex: 1, createdAt: '', updatedAt: '' },
    ], [])).toEqual(new Set([1]));
  });

  it('counts a clipboard item linked to an activity', () => {
    const plan = twoOutdoorDays();
    expect(bookedDayIndexes(plan, [
      { id: 'c1', planId: 'p1', type: 'Hotel', title: 'Tour', linkedActivityId: 'a10', createdAt: '', updatedAt: '' },
    ], [])).toEqual(new Set([1]));
  });

  it('counts a to-do only once it is done', () => {
    const plan = twoOutdoorDays();
    const todo = (status: 'todo' | 'done') => ([{
      id: 't1', planId: 'p1', title: 'Book the tour', category: 'Booking' as const,
      status, autoGenerated: false, sourceActivityId: 'a00', createdAt: '', updatedAt: '',
    }]);
    // An open to-do is the reminder to book something, not a booking —
    // treating it as one would freeze every day not yet arranged.
    expect(bookedDayIndexes(plan, [], todo('todo'))).toEqual(new Set());
    expect(bookedDayIndexes(plan, [], todo('done'))).toEqual(new Set([0]));
  });
});

describe('saying why there is no forecast', () => {
  // An itinerary with no weather on it otherwise just looks broken.
  it('says when the trip is too far ahead to forecast', () => {
    useAppStore.setState({ weatherByDate: null });
    const far: Plan = { ...planWith(['Coastal hike']), startDate: '2099-08-01', endDate: '2099-08-02' };
    show(far);
    expect(screen.getByTestId('weather-too-far')).toBeInTheDocument();
  });

  it('says when the token that geocodes the city is missing', () => {
    useAppStore.setState({ weatherByDate: null });
    localStorage.removeItem('aitp_mapbox_token');
    show(planWith(['Coastal hike']));
    expect(screen.getByTestId('weather-needs-token')).toBeInTheDocument();
  });

  it('says nothing once there is a forecast', () => {
    show(planWith(['Coastal hike']));
    expect(screen.queryByTestId('weather-too-far')).not.toBeInTheDocument();
    expect(screen.queryByTestId('weather-needs-token')).not.toBeInTheDocument();
  });
});
