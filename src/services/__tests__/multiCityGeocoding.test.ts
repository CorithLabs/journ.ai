import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tripCityContexts, geocodeLocation, geocodePlanActivities, MAX_ACTIVITY_DISTANCE_KM } from '../mapbox';
import { db, type Plan } from '../../db';

const TOKYO: [number, number] = [139.69, 35.69];
const NARA: [number, number] = [135.80, 34.69];   // ~370km from Tokyo
const PARIS: [number, number] = [2.35, 48.86];

const hit = (center: [number, number]) => ({
  ok: true,
  json: async () => ({ features: [{ center }] }),
}) as unknown as Response;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('tripCityContexts', () => {
  it('lists the destination first, then the stops', () => {
    expect(tripCityContexts({
      destination: 'Tokyo', country: 'Japan',
      stops: [{ id: '1', city: 'Nara' }, { id: '2', city: 'Osaka' }],
    })).toEqual([
      { city: 'Tokyo', context: 'Tokyo, Japan' },
      { city: 'Nara', context: 'Nara, Japan' },
      { city: 'Osaka', context: 'Osaka, Japan' },
    ]);
  });

  // "Nara" alone matches places in three countries.
  it('lends the trip country to a stop that has none', () => {
    const [, nara] = tripCityContexts({
      destination: 'Kyoto', country: 'Japan', stops: [{ id: '1', city: 'Nara' }],
    });
    expect(nara.context).toBe('Nara, Japan');
  });

  it('keeps a stop that names its own country', () => {
    const [, geneva] = tripCityContexts({
      destination: 'Paris', country: 'France',
      stops: [{ id: '1', city: 'Geneva', country: 'Switzerland' }],
    });
    expect(geneva.context).toBe('Geneva, Switzerland');
  });

  /*
   * Copenhagen and Lund are 40km apart across a border. Stripping the typed
   * qualifier and appending the trip's country turned "Lund, Sweden" into
   * "Lund, Denmark", pinning a real day trip in the wrong country.
   */
  it('keeps a country the user typed into the city itself', () => {
    const [, lund] = tripCityContexts({
      destination: 'Copenhagen, Denmark', country: 'Denmark',
      stops: [{ id: '1', city: 'Lund, Sweden' }],
    });
    expect(lund).toEqual({ city: 'Lund', context: 'Lund, Sweden' });
  });

  // The explicit field still wins over anything typed into the city.
  it('prefers a country field on the stop itself', () => {
    const [, lund] = tripCityContexts({
      destination: 'Copenhagen, Denmark', country: 'Denmark',
      stops: [{ id: '1', city: 'Lund', country: 'Sweden' }],
    });
    expect(lund.context).toBe('Lund, Sweden');
  });

  it('does not repeat a country the city already carries', () => {
    expect(tripCityContexts({ destination: 'Toronto, Canada', country: 'Canada' })[0].context)
      .toBe('Toronto, Canada');
  });
});

describe('the distance guard on a multi-city trip', () => {
  /*
   * Measuring only from the primary destination threw away the right answer:
   * a Nara temple is 40km from Kyoto and 370km from Tokyo, so on a Tokyo plan
   * it failed the 300km guard and never reached the map.
   */
  it('keeps a result near any city of the trip', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(hit(NARA)));
    const coords = await geocodeLocation('Todai-ji', 'pk.test', {
      proximity: TOKYO,
      anchors: [TOKYO, NARA],
    });
    expect(coords).toEqual(NARA);
  });

  it('still rejects a match near none of them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(hit(PARIS)));
    const coords = await geocodeLocation('Chinatown', 'pk.test', {
      proximity: TOKYO,
      anchors: [TOKYO, NARA],
    });
    expect(coords).toBeNull();
  });

  it('falls back to the single proximity point when no anchors are given', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(hit(PARIS)));
    expect(await geocodeLocation('Chinatown', 'pk.test', { proximity: TOKYO })).toBeNull();
  });

  it('leaves the guard generous enough for a real day trip', () => {
    expect(MAX_ACTIVITY_DISTANCE_KM).toBeGreaterThanOrEqual(300);
  });
});

describe('geocoding a multi-city plan', () => {
  const plan: Plan = {
    id: 'p1', name: 'Japan', destination: 'Tokyo', country: 'Japan',
    startDate: '2025-07-14', endDate: '2025-07-20',
    createdAt: '', updatedAt: '', deleted: false,
    stops: [{ id: 's1', city: 'Nara' }],
    itinerary: [{
      dayIndex: 0, label: 'Day 1',
      activities: [
        { id: 'a1', name: 'Todai-ji', time: 'morning', locationName: 'Todai-ji, Nara', notes: '', pinnedToTodo: false },
      ],
    }],
  };

  it('resolves every city of the trip, not only the destination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(hit(NARA));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);

    await geocodePlanActivities(plan, 'pk.test');

    const queries = fetchMock.mock.calls.map(c => decodeURIComponent(String(c[0])));
    expect(queries.some(q => q.includes('Tokyo, Japan'))).toBe(true);
    expect(queries.some(q => q.includes('Nara, Japan'))).toBe(true);
  });

  // "Todai-ji, Nara" should resolve near Nara, not wherever the trip starts.
  it('biases an activity toward the city it names', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(hit(decodeURIComponent(url).includes('Tokyo') ? TOKYO : NARA)),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);

    await geocodePlanActivities(plan, 'pk.test');

    const activityCall = fetchMock.mock.calls
      .map(c => String(c[0]))
      .find(u => decodeURIComponent(u).includes('Todai-ji'));
    expect(activityCall).toContain(`proximity=${NARA[0]}%2C${NARA[1]}`);
  });

  it('writes the resolved coordinates back to the plan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(hit(NARA)));
    const update = vi.spyOn(db.plans, 'update').mockResolvedValue(1);

    await geocodePlanActivities(plan, 'pk.test');

    const written = update.mock.calls[0][1] as { itinerary: Plan['itinerary'] };
    expect(written.itinerary[0].activities[0].coordinates).toEqual(NARA);
  });
});
