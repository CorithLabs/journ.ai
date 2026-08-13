import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DISCOVER_CATEGORIES,
  buildOverpassQuery,
  bboxDiagonalKm,
  isSearchableArea,
  discoverPlaces,
  clearDiscoverCache,
  type BBox,
} from '../discover';

/** Central Vancouver, a few km across. */
const VANCOUVER: BBox = [-123.18, 49.25, -123.10, 49.30];
const landmarks = DISCOVER_CATEGORIES.find((c) => c.id === 'landmarks')!;
const nature = DISCOVER_CATEGORIES.find((c) => c.id === 'nature')!;

const respondWith = (elements: unknown[]) => {
  const m = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ elements }),
  } as Response);
  vi.stubGlobal('fetch', m);
  return m;
};

beforeEach(() => {
  clearDiscoverCache();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the query put to OpenStreetMap', () => {
  it('asks for ways as well as nodes, since a park is an area', () => {
    const q = buildOverpassQuery(nature, VANCOUVER);
    expect(q).toContain('node["natural"="beach"]');
    expect(q).toContain('way["natural"="beach"]');
    // `out center` is what gives an area a point to pin.
    expect(q).toContain('out center');
  });

  it('bounds every clause to the rectangle on screen', () => {
    const q = buildOverpassQuery(landmarks, VANCOUVER);
    expect(q).toContain('(49.25,-123.18,49.3,-123.1)');
  });

  it('carries a timeout, so a slow answer fails rather than hangs', () => {
    expect(buildOverpassQuery(landmarks, VANCOUVER)).toContain('timeout:20');
  });
});

/*
 * Two reasons, and both matter: a rectangle covering a province returns either
 * a timeout or a thousand pins that mean nothing at that zoom, and it is an
 * unfair question to put to a free shared service.
 */
describe('how much area is a fair question', () => {
  it('accepts a city', () => {
    expect(isSearchableArea(VANCOUVER)).toBe(true);
  });

  it('refuses a continent', () => {
    expect(isSearchableArea([-130, 30, -70, 55])).toBe(false);
  });

  it('does not ask at all about an area too large', async () => {
    const m = respondWith([]);
    expect(await discoverPlaces(landmarks, [-130, 30, -70, 55])).toEqual([]);
    expect(m).not.toHaveBeenCalled();
  });

  it('measures the rectangle corner to corner', () => {
    expect(bboxDiagonalKm(VANCOUVER)).toBeGreaterThan(1);
    expect(bboxDiagonalKm(VANCOUVER)).toBeLessThan(20);
  });
});

describe('what comes back', () => {
  it('reads a node into somewhere you could go', async () => {
    respondWith([
      { type: 'node', id: 1, lat: 49.2734, lon: -123.1553, tags: { name: 'Kitsilano Beach', natural: 'beach' } },
    ]);

    const found = await discoverPlaces(nature, VANCOUVER);

    expect(found).toEqual([{
      id: 'node/1',
      name: 'Kitsilano Beach',
      category: 'nature',
      coordinates: [-123.1553, 49.2734],
      kind: 'beach',
    }]);
  });

  it('takes an area at its centre', async () => {
    respondWith([
      { type: 'way', id: 7, center: { lat: 49.29, lon: -123.14 }, tags: { name: 'Stanley Park', leisure: 'park' } },
    ]);

    const found = await discoverPlaces(nature, VANCOUVER);

    expect(found[0].coordinates).toEqual([-123.14, 49.29]);
  });

  // A shape with nothing to call it would go onto a card as a blank activity.
  it('drops anything with no name', async () => {
    respondWith([{ type: 'node', id: 2, lat: 49.27, lon: -123.15, tags: { natural: 'beach' } }]);
    expect(await discoverPlaces(nature, VANCOUVER)).toEqual([]);
  });

  // A park mapped as both a node and a way is one park, and both records come
  // back with different ids.
  it('counts a place mapped twice as one place', async () => {
    respondWith([
      { type: 'node', id: 1, lat: 49.29, lon: -123.14, tags: { name: 'Stanley Park', leisure: 'park' } },
      { type: 'way', id: 9, center: { lat: 49.29, lon: -123.14 }, tags: { name: 'Stanley Park', leisure: 'park' } },
    ]);

    expect(await discoverPlaces(nature, VANCOUVER)).toHaveLength(1);
  });

  it('does not ask twice about the same area', async () => {
    const m = respondWith([]);
    await discoverPlaces(nature, VANCOUVER);
    await discoverPlaces(nature, VANCOUVER);
    expect(m).toHaveBeenCalledTimes(1);
  });
});

/*
 * Overpass is shared and sometimes busy. A discovery layer failing has to
 * leave the map as it was, not put an error in front of someone browsing.
 */
describe('when Overpass cannot answer', () => {
  it('finds nothing on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await discoverPlaces(nature, VANCOUVER)).toEqual([]);
  });

  it('finds nothing when it is too busy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response));
    expect(await discoverPlaces(nature, VANCOUVER)).toEqual([]);
  });
});
