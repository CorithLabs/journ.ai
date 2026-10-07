import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  geocodeLocation,
  geocodePlanActivities,
  getPinActivities,
  haversineKm,
  totalRouteDistanceKm,
  tripCityContexts,
  MAX_ACTIVITY_DISTANCE_KM,
} from '../places';
import { db, type Plan } from '../../db';

/*
 * Places come from Photon and cities from Open-Meteo. Each fake answers by
 * which service was asked, so a test reads as "OSM says X" rather than as the
 * order requests happen to go out in.
 */
type At = [number, number];
interface Hit { at: At; name?: string; kind?: string; address?: string }

const photonBody = (hits: Hit[]) => ({
  features: hits.map((h) => {
    const [osm_key, osm_value] = (h.kind ?? 'tourism:attraction').split(':');
    return {
      geometry: { coordinates: h.at },
      properties: { name: h.name ?? 'Somewhere', osm_key, osm_value, city: h.address },
    };
  }),
});
const cityBody = (at: At | null, name = 'City', country = 'Japan') => ({
  results: at ? [{ name, latitude: at[1], longitude: at[0], country, feature_code: 'PPLA' }] : [],
});

function answer(handler: (url: string) => unknown) {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => handler(decodeURIComponent(String(url).replace(/\+/g, ' '))),
  }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const isPhoton = (url: string) => url.includes('photon');
const calls = (f: ReturnType<typeof answer>) => f.mock.calls.map((c) => decodeURIComponent(String(c[0]).replace(/\+/g, ' ')));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('finding a place', () => {
  const TOKYO: At = [139.6917, 35.6895];

  it('returns coordinates when the search finds it', async () => {
    answer(() => photonBody([{ at: [139.7967, 35.7148], name: 'Sensō-ji' }]));
    expect(await geocodeLocation('Senso-ji')).toEqual([139.7967, 35.7148]);
  });

  it('returns null for an empty name without asking', async () => {
    const f = answer(() => photonBody([]));
    expect(await geocodeLocation('')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('returns null when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    expect(await geocodeLocation('Tokyo')).toBeNull();
  });

  it('returns null when nothing matches', async () => {
    answer(() => photonBody([]));
    expect(await geocodeLocation('Unknown')).toBeNull();
  });

  it('needs no key of any kind', async () => {
    const f = answer(() => photonBody([{ at: TOKYO }]));
    await geocodeLocation('Tokyo Tower');
    expect(calls(f)[0]).not.toMatch(/token|key=/i);
  });

  /**
   * The reported bug: a Toronto plan produced pins in the US and Europe.
   * Place names are not unique — Union Station, Chinatown and Victoria Park
   * exist in dozens of countries.
   */
  describe('same-named places elsewhere', () => {
    const TORONTO: At = [-79.3832, 43.6532];
    const CHICAGO: At = [-87.6298, 41.8781];

    it('sends a proximity bias so nearby matches rank first', async () => {
      const f = answer(() => photonBody([{ at: TORONTO }]));
      await geocodeLocation('Union Station', { proximity: TORONTO });
      expect(calls(f)[0]).toContain('lon=-79.3832');
      expect(calls(f)[0]).toContain('lat=43.6532');
    });

    it('appends the trip context to a bare place name', async () => {
      const f = answer(() => photonBody([{ at: TORONTO }]));
      await geocodeLocation('Union Station', { context: 'Toronto, Canada' });
      expect(calls(f)[0]).toContain('Union Station, Toronto, Canada');
    });

    it('does not repeat context the name already carries', async () => {
      const f = answer(() => photonBody([{ at: TOKYO }]));
      await geocodeLocation('Tsukiji, Tokyo', { context: 'Tokyo, Japan' });
      expect(calls(f)[0]).not.toContain('Tokyo, Tokyo');
    });

    // Proximity only ranks; it does not filter.
    it('rejects a match on another continent', async () => {
      answer(() => photonBody([{ at: CHICAGO }]));
      expect(await geocodeLocation('Union Station', { proximity: TORONTO })).toBeNull();
    });

    it('accepts a genuine day trip within range', async () => {
      answer(() => photonBody([{ at: [-79.0849, 43.0896] }])); // Niagara Falls, ~130km
      expect(await geocodeLocation('Niagara Falls', { proximity: TORONTO })).toEqual([-79.0849, 43.0896]);
    });

    it('still returns a far result when no bias was supplied', async () => {
      answer(() => photonBody([{ at: CHICAGO }]));
      expect(await geocodeLocation('Union Station')).toEqual(CHICAGO);
    });

    // The right Union Station can be second.
    it('takes the first candidate that survives the guards, not only the first', async () => {
      answer(() => photonBody([{ at: CHICAGO }, { at: [-79.3806, 43.6453] }]));
      expect(await geocodeLocation('Union Station', { proximity: TORONTO })).toEqual([-79.3806, 43.6453]);
    });

    it('asks for more than one', async () => {
      const f = answer(() => photonBody([{ at: TORONTO }]));
      await geocodeLocation('Union Station');
      expect(calls(f)[0]).toContain('limit=5');
    });
  });

  /*
   * OSM names the temple "Sensō-ji"; "Senso-ji Temple, Tokyo, Japan" asks for
   * more words than it has. The city appended is a help until it is the thing
   * stopping the match.
   */
  describe('when the city appended gets in the way', () => {
    it('asks again by name alone', async () => {
      const f = answer((url) =>
        url.includes('Japan') ? photonBody([]) : photonBody([{ at: [139.7967, 35.7148] }]));
      const result = await geocodeLocation('Senso-ji Temple', { proximity: TOKYO, context: 'Tokyo, Japan' });
      expect(result).toEqual([139.7967, 35.7148]);
      expect(calls(f)).toHaveLength(2);
    });

    it('holds the second try to the same guards', async () => {
      answer((url) => (url.includes('Japan') ? photonBody([]) : photonBody([{ at: [2.35, 48.86] }])));
      expect(await geocodeLocation('Chinatown', { proximity: TOKYO, context: 'Tokyo, Japan' })).toBeNull();
    });

    it('does not ask twice when the first answer was good', async () => {
      const f = answer(() => photonBody([{ at: [139.7967, 35.7148] }]));
      await geocodeLocation('Senso-ji', { proximity: TOKYO, context: 'Tokyo, Japan' });
      expect(f).toHaveBeenCalledTimes(1);
    });
  });

  /*
   * An activity with no location is looked up by its own name, which is how
   * "Senso-ji Temple" reaches the map. The cost is that "Lunch" is also sent,
   * and a search with no answer replies with the city — a pin in the middle
   * of Tokyo for something that is not a place.
   */
  describe('a guess made from the activity name', () => {
    it('throws away an answer that is only the city', async () => {
      answer(() => photonBody([{ at: [139.7, 35.69], name: 'Tokyo', kind: 'place:city' }]));
      expect(await geocodeLocation('Lunch', { proximity: TOKYO, rejectCityItself: true })).toBeNull();
    });

    // The anchor comes from another service, so the city's point need not
    // match to the metre — what the result *is* decides it.
    it('throws away a ward or district too, wherever its point is', async () => {
      answer(() => photonBody([{ at: [139.7016, 35.658], name: 'Shibuya', kind: 'place:suburb' }]));
      expect(await geocodeLocation('Drinks', { proximity: TOKYO, rejectCityItself: true })).toBeNull();
    });

    it('throws away an answer sitting on the city point, whatever it calls itself', async () => {
      answer(() => photonBody([{ at: TOKYO }]));
      expect(await geocodeLocation('Lunch', { proximity: TOKYO, rejectCityItself: true })).toBeNull();
    });

    it('keeps a real place', async () => {
      answer(() => photonBody([{ at: [139.7671, 35.6812], name: 'Tokyo Station', kind: 'railway:station' }]));
      expect(await geocodeLocation('Tokyo Station', { proximity: TOKYO, rejectCityItself: true }))
        .toEqual([139.7671, 35.6812]);
    });

    // A location the traveller typed means what it says: "Tokyo" is the city,
    // on purpose, and rejecting it would drop a card they placed by hand.
    it('accepts the city when the city is what was asked for', async () => {
      answer(() => photonBody([{ at: TOKYO, name: 'Tokyo', kind: 'place:city' }]));
      expect(await geocodeLocation('Tokyo', { proximity: TOKYO })).toEqual(TOKYO);
    });
  });
});

describe('the distance guard on a multi-city trip', () => {
  const TOKYO: At = [139.69, 35.69];
  const NARA: At = [135.80, 34.69]; // ~370km from Tokyo
  const PARIS: At = [2.35, 48.86];

  // A Nara temple is 40km from Kyoto and 370km from Tokyo.
  it('keeps a result near any city of the trip', async () => {
    answer(() => photonBody([{ at: NARA }]));
    expect(await geocodeLocation('Todai-ji', { proximity: TOKYO, anchors: [TOKYO, NARA] })).toEqual(NARA);
  });

  it('still rejects a match near none of them', async () => {
    answer(() => photonBody([{ at: PARIS }]));
    expect(await geocodeLocation('Chinatown', { proximity: TOKYO, anchors: [TOKYO, NARA] })).toBeNull();
  });

  it('falls back to the single proximity point when no anchors are given', async () => {
    answer(() => photonBody([{ at: PARIS }]));
    expect(await geocodeLocation('Chinatown', { proximity: TOKYO })).toBeNull();
  });

  it('leaves the guard generous enough for a real day trip', () => {
    expect(MAX_ACTIVITY_DISTANCE_KM).toBeGreaterThanOrEqual(300);
  });
});

/*
 * The reported bug: a day with five cards showed three pins. Two of them had
 * an empty location field, and the loop skipped those outright.
 */
describe('placing a whole plan', () => {
  const TOKYO: At = [139.6917, 35.6895];
  const plan = (activities: Array<{ name: string; locationName: string; locationUnresolved?: boolean }>): Plan => ({
    id: 'plan-1', name: 'Tokyo Trip', destination: 'Tokyo, Japan',
    startDate: '2025-07-14', endDate: '2025-07-16',
    createdAt: '', updatedAt: '', deleted: false,
    itinerary: [{
      dayIndex: 0, label: 'Day 1',
      activities: activities.map((a, i) => ({ id: `x${i}`, time: '09:00', notes: '', pinnedToTodo: false, ...a })),
    }],
  });
  const saved = () => vi.mocked(db.plans.update).mock.calls[0][1] as { itinerary: Plan['itinerary'] };

  beforeEach(() => {
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);
  });

  it('finds the city with Open-Meteo and the places with OpenStreetMap', async () => {
    const f = answer((url) => (isPhoton(url) ? photonBody([{ at: [139.7967, 35.7148] }]) : cityBody(TOKYO, 'Tokyo')));
    await geocodePlanActivities(plan([{ name: 'Senso-ji', locationName: 'Senso-ji' }]));
    expect(calls(f)[0]).toContain('open-meteo');
    expect(calls(f).some(isPhoton)).toBe(true);
  });

  it('looks up an activity that was given no location, using its name', async () => {
    const f = answer((url) => (isPhoton(url) ? photonBody([{ at: [139.7967, 35.7148] }]) : cityBody(TOKYO)));
    const failed = await geocodePlanActivities(plan([{ name: 'Senso-ji Temple', locationName: '' }]));
    expect(failed.size).toBe(0);
    expect(calls(f).find(isPhoton)).toContain('Senso-ji Temple');
    expect(saved()).toMatchObject({ itinerary: [{ activities: [{ coordinates: [139.7967, 35.7148] }] }] });
  });

  it('does not pin the middle of the city for something that is not a place', async () => {
    answer((url) => (isPhoton(url) ? photonBody([{ at: TOKYO, name: 'Tokyo', kind: 'place:city' }]) : cityBody(TOKYO)));
    const failed = await geocodePlanActivities(plan([{ name: 'Lunch', locationName: '' }]));
    expect(failed.has('x0')).toBe(true);
    expect(saved().itinerary[0].activities[0]).toMatchObject({ locationUnresolved: true });
    expect(saved().itinerary[0].activities[0].coordinates).toBeUndefined();
  });

  it('keeps the address it resolved to', async () => {
    answer((url) => (isPhoton(url) ? photonBody([{ at: [139.7671, 35.6812], name: 'Ichiran', address: 'Tokyo' }]) : cityBody(TOKYO)));
    await geocodePlanActivities(plan([{ name: 'Ramen', locationName: 'Ichiran' }]));
    expect(saved().itinerary[0].activities[0].address).toContain('Tokyo');
  });

  it('records that a location was looked for and not found', async () => {
    answer((url) => (isPhoton(url) ? photonBody([]) : cityBody(TOKYO)));
    await geocodePlanActivities(plan([{ name: 'Drinks', locationName: 'somewhere downtown' }]));
    expect(saved()).toMatchObject({ itinerary: [{ activities: [{ locationUnresolved: true }] }] });
  });

  it('clears the mark when a location resolves', async () => {
    answer((url) => (isPhoton(url) ? photonBody([{ at: [139.7016, 35.658] }]) : cityBody(TOKYO)));
    await geocodePlanActivities(plan([{ name: 'Drinks', locationName: 'Shibuya', locationUnresolved: true }]));
    expect(saved()).toMatchObject({ itinerary: [{ activities: [{ locationUnresolved: false }] }] });
  });

  it('still prefers the location when one was given', async () => {
    const f = answer((url) => (isPhoton(url) ? photonBody([{ at: [139.7016, 35.658] }]) : cityBody(TOKYO)));
    await geocodePlanActivities(plan([{ name: 'Dinner', locationName: 'Shibuya' }]));
    const asked = calls(f).find(isPhoton)!;
    expect(asked).toContain('Shibuya');
    expect(asked).not.toContain('Dinner');
  });

  // A city does not move: the second open of the map does not ask again.
  it('remembers where the city is', async () => {
    const f = answer((url) => (isPhoton(url) ? photonBody([{ at: [139.7016, 35.658] }]) : cityBody(TOKYO)));
    await geocodePlanActivities(plan([{ name: 'A', locationName: 'Shibuya' }]));
    await geocodePlanActivities(plan([{ name: 'B', locationName: 'Ginza' }]));
    expect(calls(f).filter((u) => u.includes('open-meteo') && u.includes('name=Tokyo'))).toHaveLength(1);
  });
});

/*
 * A location is often only a town or a district. Searched as text near the
 * trip, "Nikko, Japan" found a hotel called Nikko in central Tokyo, and every
 * stop "in Shibuya" shared the middle of Shibuya.
 */
describe('a location that is only a town', () => {
  const TOKYO: At = [139.6917, 35.6895];
  const NIKKO: At = [139.6167, 36.75];
  const TOSHOGU: At = [139.5991, 36.7576];
  const plan = (name: string, locationName: string): Plan => ({
    id: 'p', name: 'Tokyo', destination: 'Tokyo, Japan', startDate: '2026-10-11', endDate: '2026-10-13',
    createdAt: '', updatedAt: '', deleted: false,
    itinerary: [{ dayIndex: 0, label: 'Day 1', activities: [
      { id: 'a', name, time: 'morning', locationName, notes: '', pinnedToTodo: false },
    ] }],
  });
  const saved = () => (vi.mocked(db.plans.update).mock.calls[0][1] as { itinerary: Plan['itinerary'] }).itinerary[0].activities[0];

  beforeEach(() => {
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);
  });

  it('finds the town first, then the activity inside it', async () => {
    const f = answer((url) =>
      isPhoton(url)
        ? photonBody([{ at: [139.7726, 35.6262], name: 'Hotel Nikko Tokyo' }, { at: TOSHOGU, name: 'Tōshō-gū' }])
        : url.includes('name=Nikko') ? cityBody(NIKKO, 'Nikkō') : cityBody(TOKYO, 'Tokyo'));
    await geocodePlanActivities(plan('Nikko Tosho-gu Shrine', 'Nikko, Japan'));
    expect(saved().coordinates).toEqual(TOSHOGU);
    // Looked for by its own name, near the town.
    const asked = calls(f).filter(isPhoton).at(-1)!;
    expect(asked).toContain('Nikko Tosho-gu Shrine');
    expect(asked).toContain(`lat=${NIKKO[1]}`);
  });

  it('settles for the town when nothing inside it matches the name', async () => {
    answer((url) => (isPhoton(url) ? photonBody([]) : url.includes('name=Nikko') ? cityBody(NIKKO, 'Nikko') : cityBody(TOKYO, 'Tokyo')));
    await geocodePlanActivities(plan('Day out', 'Nikko, Japan'));
    expect(saved().coordinates).toEqual(NIKKO);
  });

  // "Return to Tokyo" is not the "Return of Ultraman" artwork nearby.
  it('does not take a nearby place that only shares a word like "return"', async () => {
    answer((url) => (isPhoton(url)
      ? photonBody([{ at: [139.6077, 35.6375], name: 'Return of Ultraman Gate', kind: 'tourism:artwork' }])
      : cityBody(TOKYO, 'Tokyo')));
    await geocodePlanActivities(plan('Return to Tokyo', 'Tokyo, Japan'));
    expect(saved().coordinates).toEqual(TOKYO);
  });

  // The search ranked a small shrine 24km away above the real grounds.
  it('takes the nearest match inside the town, not the first', async () => {
    const SHIBUYA: At = [139.6965, 35.6634];
    answer((url) => {
      if (!isPhoton(url)) return cityBody(TOKYO, 'Tokyo');
      if (url.includes('Meiji')) {
        return photonBody([
          { at: [139.915, 35.797], name: 'Meiji Shrine', kind: 'amenity:place_of_worship' },
          { at: [139.702, 35.672], name: 'Meiji Shrine Museum', kind: 'tourism:museum' },
        ]);
      }
      return photonBody([{ at: SHIBUYA, name: 'Shibuya', kind: 'place:suburb' }]);
    });
    await geocodePlanActivities(plan('Meiji Shrine', 'Shibuya, Tokyo'));
    expect(saved().coordinates).toEqual([139.702, 35.672]);
  });

  // "Harajuku, Tokyo" is not the Harajuku in Saitama.
  it('does not take a namesake town in another prefecture', async () => {
    answer((url) => {
      if (isPhoton(url)) return photonBody([{ at: [139.7053, 35.6687], name: 'Takeshita Street' }]);
      if (url.includes('name=Harajuku')) {
        return { results: [{ name: 'Harajuku', latitude: 35.9, longitude: 139.35, admin1: 'Saitama', country: 'Japan', feature_code: 'PPL' }] };
      }
      return cityBody(TOKYO, 'Tokyo');
    });
    await geocodePlanActivities(plan('Harajuku Takeshita Street', 'Harajuku, Tokyo'));
    expect(saved().coordinates).toEqual([139.7053, 35.6687]);
  });
});

describe('placing a multi-city plan', () => {
  const TOKYO: At = [139.69, 35.69];
  const NARA: At = [135.80, 34.69];
  const plan: Plan = {
    id: 'p1', name: 'Japan', destination: 'Tokyo', country: 'Japan',
    startDate: '2025-07-14', endDate: '2025-07-20',
    createdAt: '', updatedAt: '', deleted: false,
    stops: [{ id: 's1', city: 'Nara' }],
    itinerary: [{
      dayIndex: 0, label: 'Day 1',
      activities: [{ id: 'a1', name: 'Todai-ji', time: 'morning', locationName: 'Todai-ji, Nara', notes: '', pinnedToTodo: false }],
    }],
  };
  const route = () => answer((url) =>
    isPhoton(url) ? photonBody([{ at: NARA }])
      : url.includes('name=Tokyo') ? cityBody(TOKYO, 'Tokyo') : cityBody(NARA, 'Nara'));

  beforeEach(() => {
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);
  });

  it('finds every city of the trip, not only the destination', async () => {
    const f = route();
    await geocodePlanActivities(plan);
    const cities = calls(f).filter((u) => u.includes('open-meteo'));
    expect(cities.some((q) => q.includes('name=Tokyo'))).toBe(true);
    expect(cities.some((q) => q.includes('name=Nara'))).toBe(true);
  });

  // "Todai-ji, Nara" should resolve near Nara, not wherever the trip starts.
  it('biases an activity toward the city it names', async () => {
    const f = route();
    await geocodePlanActivities(plan);
    const asked = calls(f).find((u) => isPhoton(u) && u.includes('Todai-ji'))!;
    expect(asked).toContain(`lon=${NARA[0]}`);
    expect(asked).toContain(`lat=${NARA[1]}`);
  });

  it('writes the resolved coordinates back to the plan', async () => {
    route();
    const update = vi.mocked(db.plans.update);
    await geocodePlanActivities(plan);
    const written = update.mock.calls[0][1] as { itinerary: Plan['itinerary'] };
    expect(written.itinerary[0].activities[0].coordinates).toEqual(NARA);
  });
});

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
    const [, nara] = tripCityContexts({ destination: 'Kyoto', country: 'Japan', stops: [{ id: '1', city: 'Nara' }] });
    expect(nara.context).toBe('Nara, Japan');
  });

  it('keeps a stop that names its own country', () => {
    const [, geneva] = tripCityContexts({
      destination: 'Paris', country: 'France', stops: [{ id: '1', city: 'Geneva', country: 'Switzerland' }],
    });
    expect(geneva.context).toBe('Geneva, Switzerland');
  });

  // Copenhagen and Lund are 40km apart across a border.
  it('keeps a country the user typed into the city itself', () => {
    const [, lund] = tripCityContexts({
      destination: 'Copenhagen, Denmark', country: 'Denmark', stops: [{ id: '1', city: 'Lund, Sweden' }],
    });
    expect(lund).toEqual({ city: 'Lund', context: 'Lund, Sweden' });
  });

  it('prefers a country field on the stop itself', () => {
    const [, lund] = tripCityContexts({
      destination: 'Copenhagen, Denmark', country: 'Denmark', stops: [{ id: '1', city: 'Lund', country: 'Sweden' }],
    });
    expect(lund.context).toBe('Lund, Sweden');
  });

  it('does not repeat a country the city already carries', () => {
    expect(tripCityContexts({ destination: 'Toronto, Canada', country: 'Canada' })[0].context).toBe('Toronto, Canada');
  });

  /*
   * On a Montreal → Percé road trip Montreal appeared in no list at all: it
   * is neither the destination nor a stop, only an arrival city.
   */
  describe('the city a road trip starts from', () => {
    const roadTrip = {
      destination: 'Percé', country: 'Canada',
      arrival: { city: 'Montreal', mode: 'car' as const },
      departure: { city: 'Montreal', mode: 'car' as const },
      stops: [{ id: '1', city: 'Matane' }, { id: '2', city: 'Percé' }],
    };

    it('is an anchor like any other city of the trip', () => {
      expect(tripCityContexts(roadTrip).map((c) => c.context)).toEqual([
        'Montreal, Canada', 'Matane, Canada', 'Percé, Canada',
      ]);
    });

    it('is resolved once, not twice', () => {
      expect(tripCityContexts(roadTrip).filter((c) => c.city === 'Montreal')).toHaveLength(1);
    });

    it('keeps a country given on the leg itself', () => {
      const [first] = tripCityContexts({
        destination: 'Percé', country: 'Canada', arrival: { city: 'Burlington', country: 'United States' },
      });
      expect(first.context).toBe('Burlington, United States');
    });
  });
});

describe('getPinActivities', () => {
  const plan: Plan = {
    id: 'p', name: 'T', destination: 'Tokyo', startDate: '2025-07-14', endDate: '2025-07-16',
    createdAt: '', updatedAt: '', deleted: false,
    itinerary: [
      { dayIndex: 0, label: 'Day 1', activities: [
        { id: 'a1', name: 'Temple', time: '09:00', locationName: 'Tokyo', coordinates: [139.69, 35.69], notes: '', pinnedToTodo: false },
        { id: 'a2', name: 'Lunch', time: '12:00', locationName: 'Shibuya', coordinates: [139.70, 35.66], notes: '', pinnedToTodo: false },
      ] },
      { dayIndex: 1, label: 'Day 2', activities: [
        { id: 'a3', name: 'Museum', time: '10:00', locationName: 'Ueno', notes: '', pinnedToTodo: false },
      ] },
    ],
  };

  it('returns only activities with coordinates, numbered and coloured by day', () => {
    const pins = getPinActivities(plan);
    expect(pins.map((p) => p.activity.id)).toEqual(['a1', 'a2']);
    expect(pins.map((p) => p.sequenceNumber)).toEqual([1, 2]);
    expect(pins[0].dayColor).toBe('#06b6d4');
  });
});

describe('distances', () => {
  it('is zero between a point and itself', () => {
    expect(haversineKm([139.69, 35.69], [139.69, 35.69])).toBe(0);
  });

  it('puts Tokyo about 400km from Osaka', () => {
    const d = haversineKm([139.6917, 35.6895], [135.5022, 34.6937]);
    expect(d).toBeGreaterThan(390);
    expect(d).toBeLessThan(420);
  });

  it('adds up a route leg by leg', () => {
    const coords: At[] = [[139.6917, 35.6895], [139.7016, 35.658], [135.5022, 34.6937]];
    expect(totalRouteDistanceKm([])).toBe(0);
    expect(totalRouteDistanceKm(coords)).toBeCloseTo(haversineKm(coords[0], coords[1]) + haversineKm(coords[1], coords[2]), 5);
  });
});
