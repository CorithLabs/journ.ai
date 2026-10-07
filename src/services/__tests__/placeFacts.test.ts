import { describe, it, expect, vi, afterEach } from 'vitest';
import type * as Facts from '../placeFacts';

// The test setup stands in for fetchPlaceFacts everywhere else; these are its own tests.
const { fetchPlaceFacts, sameNamedPlace, nameScore } = await vi.importActual<typeof Facts>('../placeFacts');

const SHRINE: [number, number] = [139.6993, 35.6764];

interface PhotonHit { name: string; at: [number, number]; kind?: string; osm?: string; extent?: [number, number, number, number] }

/** Answers by which service was asked. */
function serve(h: {
  near?: unknown; search?: unknown; summary?: unknown;
  photon?: PhotonHit[]; osm?: Record<string, Record<string, string>>;
}) {
  const f = vi.fn(async (url: string) => {
    // By host and path, parsed, rather than by substring of the whole URL.
    const u = new URL(String(url));
    let body: unknown;
    if (u.hostname === 'photon.komoot.io') {
      body = { features: (h.photon ?? []).map((p) => {
        const [key, value] = (p.kind ?? 'tourism:attraction').split(':');
        const [t, id] = (p.osm ?? 'W:1').split(':');
        return { geometry: { coordinates: p.at }, properties: { name: p.name, osm_key: key, osm_value: value, osm_type: t, osm_id: Number(id), extent: p.extent } };
      }) };
    } else if (u.hostname === 'api.openstreetmap.org') {
      const key = u.pathname.split('/0.6/')[1].replace('.json', '');
      body = h.osm?.[key] ? { elements: [{ tags: h.osm[key] }] } : undefined;
    } else if (u.hostname === 'en.wikipedia.org') {
      if (u.searchParams.get('list') === 'geosearch') body = h.near;
      else if (u.searchParams.get('list') === 'search') body = h.search;
      else if (u.pathname.startsWith('/api/rest_v1/page/summary/')) body = h.summary;
    }
    return { ok: body !== undefined, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', f);
  return f;
}

const summary = (title: string) => ({
  type: 'standard',
  title,
  extract: `${title} is a Shinto shrine in Shibuya, Tokyo.`,
  content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } },
  thumbnail: { source: 'https://upload.wikimedia.org/x.jpg' },
});
const noWiki = { near: { query: { geosearch: [] } }, search: { query: { search: [] } } };

afterEach(() => vi.unstubAllGlobals());

describe('whether a name is the same place', () => {
  it('matches on the distinctive word, not the kind of place', () => {
    expect(sameNamedPlace('Meiji Shrine', 'Meiji Shrine')).toBe(true);
    expect(sameNamedPlace('Senso-ji Temple', 'Sensō-ji')).toBe(true);
    expect(sameNamedPlace('Shinjuku Gyoen', 'Shinjuku Gyo-en')).toBe(true);
    // Every shrine in Japan is a shrine.
    expect(sameNamedPlace('Meiji Shrine', 'Nezu Shrine')).toBe(false);
  });

  // "Ichiran Shibuya" is a ramen shop, not the Shibuya Crossing.
  it('does not match on the neighbourhood', () => {
    expect(sameNamedPlace('Ichiran Shibuya', 'Shibuya Crossing', ['Shibuya', 'Tokyo'])).toBe(false);
    expect(sameNamedPlace('Ichiran Shibuya', 'Ichiran', ['Shibuya', 'Tokyo'])).toBe(true);
  });

  // Asked for a shrine, the shrine's museum is not it.
  it('ranks a different kind of place below the one asked for', () => {
    expect(nameScore('Meiji Shrine', 'Meiji Shrine')).toBeGreaterThan(nameScore('Meiji Shrine', 'Meiji Shrine Museum'));
    expect(nameScore('Meiji Shrine', 'Meiji Shrine')).toBeGreaterThan(nameScore('Meiji Shrine', 'Meiji Shrine Inner Garden'));
  });
});

describe('finding the article', () => {
  it('takes the best-named article near the pin', async () => {
    serve({
      near: { query: { geosearch: [
        { title: 'Yoyogi Park', dist: 20 },
        { title: 'Meiji Shrine Inner Garden', dist: 30 },
        { title: 'Meiji Shrine', dist: 340 },
      ] } },
      summary: summary('Meiji Shrine'),
    });
    expect((await fetchPlaceFacts({ name: 'Meiji Shrine', coordinates: SHRINE })).wiki?.title).toBe('Meiji Shrine');
  });

  it('searches by name when nothing near the pin matches', async () => {
    serve({
      near: { query: { geosearch: [{ title: 'Yoyogi Park', dist: 20 }] } },
      search: { query: { search: [{ title: 'Meiji (era)' }, { title: 'Meiji Shrine' }] } },
      summary: summary('Meiji Shrine'),
    });
    expect((await fetchPlaceFacts({ name: 'Meiji Shrine', coordinates: SHRINE })).wiki?.title).toBe('Meiji Shrine');
  });

  it('has no article rather than the wrong one', async () => {
    serve({
      near: { query: { geosearch: [{ title: 'Shibuya Crossing', dist: 40 }] } },
      search: { query: { search: [{ title: 'Shibuya Crossing' }] } },
    });
    const facts = await fetchPlaceFacts({ name: 'Ichiran Shibuya', coordinates: SHRINE, city: 'Tokyo', location: 'Shibuya, Tokyo' });
    expect(facts.wiki).toBeUndefined();
  });
});

describe('the practical details', () => {
  it("reads the place's own map record: hours, fee, access, local name", async () => {
    const f = serve({
      ...noWiki,
      photon: [{ name: 'Meiji Shrine', at: [139.6993, 35.6762], kind: 'amenity:place_of_worship', osm: 'W:42' }],
      osm: { 'way/42': { name: '明治神宮', 'name:en': 'Meiji Shrine', amenity: 'place_of_worship', opening_hours: 'sunrise-sunset', fee: 'no', wheelchair: 'limited', 'contact:website': 'https://www.meijijingu.or.jp/' } },
    });
    const { map } = await fetchPlaceFacts({ name: 'Meiji Shrine', coordinates: SHRINE });
    expect(map).toMatchObject({
      openingHours: 'sunrise-sunset', fee: 'no', wheelchair: 'limited',
      website: 'https://www.meijijingu.or.jp/', kind: 'place of worship', localName: '明治神宮',
    });
    expect(f.mock.calls.some((c) => String(c[0]).endsWith('/api/0.6/way/42.json'))).toBe(true);
  });

  // The search ranks by name; a namesake 24km away can come first.
  it('only takes a record near the pin', async () => {
    serve({
      ...noWiki,
      photon: [{ name: 'Meiji Shrine', at: [139.915, 35.797], osm: 'W:1' }],
      osm: { 'way/1': { name: '明治神社', 'name:en': 'Meiji Shrine', opening_hours: '24/7' } },
    });
    expect((await fetchPlaceFacts({ name: 'Meiji Shrine', coordinates: SHRINE })).map).toBeUndefined();
  });

  // Bus stops and footpaths share the name.
  it('skips records about getting there', async () => {
    serve({
      ...noWiki,
      photon: [
        { name: 'Meiji Shrine', at: SHRINE, kind: 'highway:bus_stop', osm: 'N:7' },
        { name: 'Meiji Shrine', at: [139.6994, 35.6765], kind: 'amenity:place_of_worship', osm: 'W:8' },
      ],
      osm: { 'way/8': { name: '明治神宮', 'name:en': 'Meiji Shrine', fee: 'no' } },
    });
    expect((await fetchPlaceFacts({ name: 'Meiji Shrine', coordinates: SHRINE })).map?.fee).toBe('no');
  });

  // Same name, no kind given: the garden is the big one, the museum is in it.
  it('takes the larger feature when the names tie', async () => {
    serve({
      ...noWiki,
      photon: [
        { name: 'Shinjuku Gyoen Museum', at: [139.7101, 35.6852], kind: 'tourism:museum', osm: 'W:2', extent: [139.710, 35.686, 139.711, 35.685] },
        { name: 'Shinjuku Gyoen National Garden', at: [139.7100, 35.6850], kind: 'leisure:park', osm: 'W:3', extent: [139.705, 35.690, 139.716, 35.680] },
      ],
      osm: {
        'way/2': { name: '新宿御苑ミュージアム', 'name:en': 'Shinjuku Gyoen Museum', tourism: 'museum' },
        'way/3': { name: '新宿御苑', 'name:en': 'Shinjuku Gyoen National Garden', leisure: 'park', opening_hours: 'Mo off' },
      },
    });
    const { map } = await fetchPlaceFacts({ name: 'Shinjuku Gyoen', coordinates: [139.7101, 35.6852], city: 'Tokyo', location: 'Shinjuku, Tokyo' });
    expect(map?.kind).toBe('park');
    expect(map?.openingHours).toBe('Mo off');
  });

  it('keeps only the local script of a name that mixes scripts', async () => {
    serve({
      ...noWiki,
      photon: [{ name: 'Sensō-ji', at: [139.7967, 35.7148], osm: 'N:9' }],
      osm: { 'node/9': { name: 'Храм Сенсодзи 金龍山 浅草寺', 'name:en': 'Sensō-ji', tourism: 'attraction' } },
    });
    expect((await fetchPlaceFacts({ name: 'Senso-ji Temple', coordinates: [139.7967, 35.7148] })).map?.localName).toBe('金龍山 浅草寺');
  });

  it('does not ask the map without a pin', async () => {
    const f = serve({ search: { query: { search: [] } } });
    await fetchPlaceFacts({ name: 'Somewhere' });
    expect(f.mock.calls.some((c) => /photon|openstreetmap/.test(String(c[0])))).toBe(false);
  });
});

describe('names written another way', () => {
  // An itinerary in English says "Residence"; the article says "Residenz".
  it('matches the English and the local spelling', () => {
    expect(sameNamedPlace('Munich Residence', 'Munich Residenz', ['Munich'])).toBe(true);
    expect(sameNamedPlace('Residenz München', 'Munich Residenz', ['Munich'])).toBe(true);
  });

  it('does not stretch short words', () => {
    expect(sameNamedPlace('Ueno Park', 'Uena')).toBe(false);
  });

  // The search found it by a name the article is not titled with.
  it('counts a redirect as the name', async () => {
    serve({ search: { query: { search: [{ title: 'Munich Residenz', redirecttitle: 'Wittelsbach Palace' }] } }, summary: summary('Munich Residenz') });
    expect((await fetchPlaceFacts({ name: 'Wittelsbach Palace', city: 'Munich' })).wiki?.title).toBe('Munich Residenz');
  });

  // "Royal Residence" once matched "List of royal palaces".
  it('never takes a list of places for a place', async () => {
    serve({ search: { query: { search: [{ title: 'List of royal palaces' }, { title: 'Munich Residenz' }] } }, summary: summary('Munich Residenz') });
    expect((await fetchPlaceFacts({ name: 'Royal Residence', city: 'Munich' })).wiki?.title).toBe('Munich Residenz');
  });

  // "Lunch" once matched the Pepper Lunch chain.
  it('does not look up a name made only of everyday words', () => {
    expect(sameNamedPlace('Lunch', 'Pepper Lunch')).toBe(false);
    expect(sameNamedPlace('Evening walk', 'Evening Walk (painting)')).toBe(false);
  });
});

describe('when the sources cannot be reached', () => {
  it('comes back empty instead of failing, and says it is incomplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const facts = await fetchPlaceFacts({ name: 'Meiji Shrine', coordinates: SHRINE });
    expect(facts.wiki).toBeUndefined();
    expect(facts.map).toBeUndefined();
    expect(facts.checkedAt).toBeTruthy();
    expect(facts.complete).toBe(false);
  });

  it('counts a busy server as unreached, and a plain miss as an answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response));
    expect((await fetchPlaceFacts({ name: 'Meiji Shrine' })).complete).toBe(false);
    serve({ search: { query: { search: [] } } });
    expect((await fetchPlaceFacts({ name: 'Meiji Shrine' })).complete).toBe(true);
  });

  it('records what was looked up', async () => {
    serve({ search: { query: { search: [] } } });
    const facts = await fetchPlaceFacts({ name: 'Meiji Shrine', location: 'Shibuya, Tokyo', coordinates: SHRINE });
    expect(facts.query).toBe('meiji shrine|shibuya, tokyo|139.699,35.676');
  });
});
