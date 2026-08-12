import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchVenues } from '../venues';
import { MAPBOX_TOKEN_KEY } from '../mapbox';

const TOKYO: [number, number] = [139.6917, 35.6895];
const SHIBUYA: [number, number] = [139.7016, 35.658];

const respondWith = (features: Array<{ text?: string; place_name?: string; center?: unknown }>) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const url = (m: ReturnType<typeof respondWith>) => decodeURIComponent(String(m.mock.calls[0][0]));

beforeEach(() => {
  localStorage.setItem(MAPBOX_TOKEN_KEY, 'pk.test');
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('searching for a venue', () => {
  it('returns the venue name and the address that tells two branches apart', async () => {
    respondWith([
      { text: 'Ichiran', place_name: 'Ichiran, 1-22-7 Jinnan, Shibuya, Tokyo', center: SHIBUYA },
    ]);

    const hits = await searchVenues('Ichiran', { proximity: TOKYO });

    expect(hits).toEqual([
      {
        name: 'Ichiran',
        address: 'Ichiran, 1-22-7 Jinnan, Shibuya, Tokyo',
        coordinates: SHIBUYA,
      },
    ]);
  });

  // Coverage is uneven: a restaurant in Tokyo is in the POI index, a small
  // place in Gaspé may only exist as the street it is on.
  it('asks for addresses as well as points of interest', async () => {
    const m = respondWith([]);
    await searchVenues('Auberge', { proximity: TOKYO });
    expect(url(m)).toContain('types=poi,address');
  });

  it('biases the search toward the city and puts it in the query too', async () => {
    const m = respondWith([]);
    await searchVenues('Ichiran', { proximity: TOKYO, context: 'Tokyo, Japan' });
    expect(url(m)).toContain('proximity=139.6917,35.6895');
    expect(url(m)).toContain('Ichiran, Tokyo, Japan');
  });

  it('does not repeat a city the query already names', async () => {
    const m = respondWith([]);
    await searchVenues('Ichiran Tokyo', { context: 'Tokyo, Japan' });
    expect(url(m)).not.toContain('Tokyo, Japan');
  });

  // Proximity ranks but does not exclude — the same trap that put itinerary
  // pins on other continents.
  it('drops a match that is nowhere near the trip', async () => {
    respondWith([
      { text: 'Ichiran', place_name: 'Ichiran, New York', center: [-73.98, 40.75] },
      { text: 'Ichiran', place_name: 'Ichiran, Shibuya, Tokyo', center: SHIBUYA },
    ]);

    const hits = await searchVenues('Ichiran', { proximity: TOKYO });

    expect(hits.map((h) => h.address)).toEqual(['Ichiran, Shibuya, Tokyo']);
  });

  it('keeps everything when there is no city to measure from', async () => {
    respondWith([{ text: 'Ichiran', place_name: 'Ichiran, New York', center: [-73.98, 40.75] }]);
    expect(await searchVenues('Ichiran')).toHaveLength(1);
  });

  it('ignores a result with no coordinates to offer', async () => {
    respondWith([{ text: 'Somewhere', place_name: 'Somewhere' }]);
    expect(await searchVenues('Somewhere')).toEqual([]);
  });
});

/*
 * The field has to keep working as a plain text box when the search cannot.
 * A trip is worth writing down without a Mapbox token, and a failed lookup
 * must never be the reason an activity cannot be added.
 */
describe('when the search cannot run', () => {
  it('offers nothing without a token, rather than failing', async () => {
    localStorage.clear();
    const m = respondWith([]);
    expect(await searchVenues('Ichiran')).toEqual([]);
    expect(m).not.toHaveBeenCalled();
  });

  it('offers nothing on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await searchVenues('Ichiran')).toEqual([]);
  });

  it('offers nothing on a bad response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response));
    expect(await searchVenues('Ichiran')).toEqual([]);
  });

  it('does not search on a fragment too short to mean anything', async () => {
    const m = respondWith([]);
    expect(await searchVenues('I')).toEqual([]);
    expect(m).not.toHaveBeenCalled();
  });
});
