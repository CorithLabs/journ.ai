import { describe, it, expect, vi, afterEach } from 'vitest';
import { photonSearch } from '../photon';

const KITS = {
  geometry: { coordinates: [-123.1553, 49.2734] },
  properties: {
    name: 'Kitsilano Beach',
    city: 'Vancouver',
    state: 'British Columbia',
    country: 'Canada',
    osm_key: 'leisure',
    osm_value: 'beach_resort',
  },
};

const respondWith = (features: unknown[]) => {
  const m = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features }),
  } as Response);
  vi.stubGlobal('fetch', m);
  return m;
};

const url = (m: ReturnType<typeof respondWith>) => decodeURIComponent(String(m.mock.calls[0][0]));

afterEach(() => {
  vi.restoreAllMocks();
});

/*
 * "Kitsilano Beach, Vancouver" is the case that prompted this: Mapbox returned
 * nothing usable and OSM has had it named for years. Beaches, parks and
 * viewpoints are where the two providers differ most.
 */
describe('asking OpenStreetMap', () => {
  it('finds a named beach, with the address built from its parts', async () => {
    respondWith([KITS]);

    const hits = await photonSearch('Kitsilano Beach');

    expect(hits[0]).toEqual({
      name: 'Kitsilano Beach',
      address: 'Vancouver, British Columbia, Canada',
      coordinates: [-123.1553, 49.2734],
      kind: 'leisure:beach_resort',
    });
  });

  it('puts a street address together outward from the building', async () => {
    respondWith([{
      geometry: { coordinates: [-123.1, 49.2] },
      properties: { housenumber: '1305', street: 'Arbutus St', city: 'Vancouver', country: 'Canada' },
    }]);

    expect((await photonSearch('Arbutus'))[0].address).toBe('1305 Arbutus St, Vancouver, Canada');
  });

  // Missing parts are dropped rather than leaving the double commas that give
  // a template away.
  it('leaves no gaps where a part was missing', async () => {
    respondWith([{
      geometry: { coordinates: [-123.1, 49.2] },
      properties: { name: 'Somewhere', country: 'Canada' },
    }]);

    expect((await photonSearch('Somewhere'))[0].address).toBe('Canada');
  });

  it('biases toward the trip, in the order Photon reads', async () => {
    const m = respondWith([]);
    await photonSearch('Beach', { proximity: [-123.12, 49.28] });
    expect(url(m)).toContain('lon=-123.12');
    expect(url(m)).toContain('lat=49.28');
  });

  it('sends one parameter per tag, not one joined list', async () => {
    const m = respondWith([]);
    await photonSearch('food', { osmTags: ['amenity:restaurant', 'amenity:cafe'] });
    expect(url(m)).toContain('osm_tag=amenity:restaurant');
    expect(url(m)).toContain('osm_tag=amenity:cafe');
  });

  it('drops a point with nothing to call it', async () => {
    respondWith([{ geometry: { coordinates: [-123.1, 49.2] }, properties: {} }]);
    expect(await photonSearch('nowhere')).toEqual([]);
  });

  it('drops a result with no coordinates', async () => {
    respondWith([{ properties: { name: 'Somewhere' } }]);
    expect(await photonSearch('Somewhere')).toEqual([]);
  });
});

/*
 * This is the second thing asked. Its silence has to look like the first
 * one's — a location that cannot be found, not an error to deal with.
 */
describe('when OpenStreetMap cannot answer', () => {
  it('says nothing on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await photonSearch('Kitsilano Beach')).toEqual([]);
  });

  it('says nothing on a bad response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response));
    expect(await photonSearch('Kitsilano Beach')).toEqual([]);
  });

  it('does not ask about a fragment too short to mean anything', async () => {
    const m = respondWith([]);
    expect(await photonSearch('K')).toEqual([]);
    expect(m).not.toHaveBeenCalled();
  });
});
