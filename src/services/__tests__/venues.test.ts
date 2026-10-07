import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchVenues } from '../venues';

const TOKYO: [number, number] = [139.6917, 35.6895];
const SHIBUYA: [number, number] = [139.7016, 35.658];

/** Photon's answer: OpenStreetMap features with their address parts. */
const respondWith = (places: Array<{ name: string; at?: [number, number]; street?: string; city?: string }>) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      features: places.map((p) => ({
        geometry: p.at ? { coordinates: p.at } : undefined,
        properties: { name: p.name, street: p.street, city: p.city, osm_key: 'amenity', osm_value: 'restaurant' },
      })),
    }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const url = (m: ReturnType<typeof respondWith>) => decodeURIComponent(String(m.mock.calls[0][0]));

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('searching for a venue', () => {
  it('returns the venue name and the address that tells two branches apart', async () => {
    respondWith([{ name: 'Ichiran', at: SHIBUYA, street: 'Jinnan', city: 'Tokyo' }]);

    const hits = await searchVenues('Ichiran', { proximity: TOKYO });

    expect(hits).toEqual([{ name: 'Ichiran', address: 'Jinnan, Tokyo', coordinates: SHIBUYA }]);
  });

  // OpenStreetMap needs no key, so the picker works for everyone.
  it('asks OpenStreetMap, with no key', async () => {
    const m = respondWith([]);
    await searchVenues('Kitsilano Beach');
    expect(url(m)).toContain('photon');
    expect(url(m)).not.toMatch(/token|key=/i);
  });

  it('biases the search toward the city', async () => {
    const m = respondWith([]);
    await searchVenues('Ichiran', { proximity: TOKYO });
    expect(url(m)).toContain('lon=139.6917');
    expect(url(m)).toContain('lat=35.6895');
  });

  // Proximity ranks but does not exclude — the same trap that put itinerary
  // pins on other continents.
  it('drops a match that is nowhere near the trip', async () => {
    respondWith([
      { name: 'Ichiran', at: [-73.98, 40.75], city: 'New York' },
      { name: 'Ichiran', at: SHIBUYA, city: 'Tokyo' },
    ]);

    const hits = await searchVenues('Ichiran', { proximity: TOKYO });

    expect(hits.map((h) => h.address)).toEqual(['Tokyo']);
  });

  it('keeps everything when there is no city to measure from', async () => {
    respondWith([{ name: 'Ichiran', at: [-73.98, 40.75], city: 'New York' }]);
    expect(await searchVenues('Ichiran')).toHaveLength(1);
  });

  it('ignores a result with no coordinates to offer', async () => {
    respondWith([{ name: 'Somewhere' }]);
    expect(await searchVenues('Somewhere')).toEqual([]);
  });
});

/*
 * The field has to keep working as a plain text box when the search cannot.
 * A failed lookup must never be the reason an activity cannot be added.
 */
describe('when the search cannot run', () => {
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
