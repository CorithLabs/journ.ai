import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  geocodeLocation,
  geocodePlanActivities,
  getPinActivities,
  haversineKm,
  totalRouteDistanceKm,
} from '../mapbox';
import { db, type Plan } from '../../db';

const MOCK_GEOCODE_RESPONSE = {
  features: [{ center: [139.6917, 35.6895] }],
};

const mockPlan: Plan = {
  id: 'plan-1',
  name: 'Tokyo Trip',
  destination: 'Tokyo, Japan',
  startDate: '2025-07-14',
  endDate: '2025-07-16',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deleted: false,
  itinerary: [
    {
      dayIndex: 0,
      label: 'Day 1 — Mon 14 Jul',
      activities: [
        {
          id: 'a1',
          name: 'Temple Visit',
          time: '09:00',
          locationName: 'Tokyo',
          coordinates: [139.6917, 35.6895],
          notes: '',
          pinnedToTodo: false,
        },
        {
          id: 'a2',
          name: 'Lunch',
          time: '12:00',
          locationName: 'Shibuya',
          coordinates: [139.7016, 35.6580],
          notes: '',
          pinnedToTodo: false,
        },
      ],
    },
    {
      dayIndex: 1,
      label: 'Day 2 — Tue 15 Jul',
      activities: [
        {
          id: 'a3',
          name: 'Museum',
          time: '10:00',
          locationName: 'Ueno',
          notes: '',
          pinnedToTodo: false,
          // No coordinates — not geocoded yet
        },
      ],
    },
  ],
};

describe('geocodeLocation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns coordinates when geocoding succeeds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_GEOCODE_RESPONSE,
    } as Response);
    const result = await geocodeLocation('Tokyo', 'pk.test-token');
    expect(result).toEqual([139.6917, 35.6895]);
  });

  it('returns null for empty location name', async () => {
    const result = await geocodeLocation('', 'pk.test-token');
    expect(result).toBeNull();
  });

  it('returns null when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'));
    const result = await geocodeLocation('Tokyo', 'pk.test-token');
    expect(result).toBeNull();
  });

  it('returns null when no features returned', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [] }),
    } as Response);
    const result = await geocodeLocation('Unknown', 'pk.test-token');
    expect(result).toBeNull();
  });

  /**
   * The reported bug: a Toronto plan produced pins in the US and Europe.
   * Place names are not unique — Union Station, Chinatown and Victoria Park
   * exist in dozens of countries — and an unbiased query returns whichever
   * Mapbox ranks highest globally.
   */
  describe('disambiguation against same-named places elsewhere', () => {
    const TORONTO: [number, number] = [-79.3832, 43.6532];
    const respondWith = (center: [number, number]) =>
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [{ center }] }),
      } as Response);

    const requestedUrl = () => String(vi.mocked(fetch).mock.calls[0][0]);

    it('sends a proximity bias so nearby matches rank first', async () => {
      respondWith(TORONTO);
      await geocodeLocation('Union Station', 'pk.test', { proximity: TORONTO });
      expect(requestedUrl()).toContain('proximity=-79.3832%2C43.6532');
    });

    it('appends the trip context to a bare place name', async () => {
      respondWith(TORONTO);
      await geocodeLocation('Union Station', 'pk.test', { context: 'Toronto, Canada' });
      expect(decodeURIComponent(requestedUrl())).toContain('Union Station, Toronto, Canada');
    });

    it('does not repeat context the name already carries', async () => {
      respondWith(TORONTO);
      await geocodeLocation('Tsukiji, Tokyo', 'pk.test', { context: 'Tokyo, Japan' });
      const url = decodeURIComponent(requestedUrl());
      expect(url).not.toContain('Tokyo, Tokyo');
    });

    // Proximity only ranks; it does not filter. A name with no local match
    // still returns the far-away one, which is what put pins on other
    // continents even with a bias applied.
    it('rejects a match on another continent', async () => {
      respondWith([-87.6298, 41.8781]); // Chicago
      const result = await geocodeLocation('Union Station', 'pk.test', {
        proximity: TORONTO,
      });
      expect(result).toBeNull();
    });

    it('accepts a genuine day trip within range', async () => {
      respondWith([-79.0849, 43.0896]); // Niagara Falls, ~130km
      const result = await geocodeLocation('Niagara Falls', 'pk.test', {
        proximity: TORONTO,
      });
      expect(result).toEqual([-79.0849, 43.0896]);
    });

    it('still returns a far result when no bias was supplied', async () => {
      respondWith([-87.6298, 41.8781]);
      const result = await geocodeLocation('Union Station', 'pk.test');
      expect(result).toEqual([-87.6298, 41.8781]);
    });
  });

  /*
   * An activity with no location is now looked up by its own name, which is
   * how "Senso-ji Temple" reaches the map. The cost is that "Lunch" is also
   * sent, and a geocoder with no answer replies with the city — a pin in the
   * middle of Tokyo for something that is not a place.
   */
  describe('a guess made from the activity name', () => {
    const TOKYO: [number, number] = [139.6917, 35.6895];
    const respondWith = (center: [number, number]) =>
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [{ center }] }),
      } as Response);

    it('throws away an answer that is only the city', async () => {
      respondWith(TOKYO);
      const result = await geocodeLocation('Lunch', 'pk.test', {
        proximity: TOKYO,
        rejectCityItself: true,
      });
      expect(result).toBeNull();
    });

    it('keeps a real place a short walk from the city point', async () => {
      respondWith([139.7671, 35.6812]); // Tokyo Station, ~7km out
      const result = await geocodeLocation('Tokyo Station', 'pk.test', {
        proximity: TOKYO,
        rejectCityItself: true,
      });
      expect(result).toEqual([139.7671, 35.6812]);
    });

    // A location the traveller typed means what it says: "Tokyo" is the city,
    // on purpose, and rejecting it would drop a card they placed by hand.
    it('accepts the city when the city is what was asked for', async () => {
      respondWith(TOKYO);
      const result = await geocodeLocation('Tokyo', 'pk.test', { proximity: TOKYO });
      expect(result).toEqual(TOKYO);
    });
  });
});

/*
 * The reported bug: a day with five cards showed three pins. Two of them had
 * an empty location field, and the loop skipped those outright — they were
 * never looked up, so they could never appear.
 */
describe('geocoding a whole plan', () => {
  const TOKYO: [number, number] = [139.6917, 35.6895];

  /** The city anchor first, then one answer per activity looked up. */
  const answerWith = (...centers: Array<[number, number] | null>) => {
    const fetchMock = vi.fn();
    for (const center of centers) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: center ? [{ center }] : [] }),
      } as Response);
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  const planWith = (activities: Array<{ name: string; locationName: string }>): Plan => ({
    ...mockPlan,
    itinerary: [{
      dayIndex: 0,
      label: 'Day 1',
      activities: activities.map((a, i) => ({
        id: `x${i}`, time: '09:00', notes: '', pinnedToTodo: false, ...a,
      })),
    }],
  });

  beforeEach(() => {
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('looks up an activity that was given no location, using its name', async () => {
    const fetchMock = answerWith(TOKYO, [139.7967, 35.7148]); // anchor, then Senso-ji
    const plan = planWith([{ name: 'Senso-ji Temple', locationName: '' }]);

    const failed = await geocodePlanActivities(plan, 'pk.test');

    expect(failed.size).toBe(0);
    expect(decodeURIComponent(String(fetchMock.mock.calls[1][0]))).toContain('Senso-ji Temple');
    expect(vi.mocked(db.plans.update).mock.calls[0][1]).toMatchObject({
      itinerary: [{ activities: [{ coordinates: [139.7967, 35.7148] }] }],
    });
  });

  // The price of guessing from the name: "Lunch" is not a place, and the
  // geocoder answers with the city rather than nothing.
  it('does not pin the middle of the city for something that is not a place', async () => {
    answerWith(TOKYO, TOKYO);
    const plan = planWith([{ name: 'Lunch', locationName: '' }]);

    const failed = await geocodePlanActivities(plan, 'pk.test');

    expect(failed.has('x0')).toBe(true);
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  it('still prefers the location when one was given', async () => {
    const fetchMock = answerWith(TOKYO, [139.7016, 35.658]);
    const plan = planWith([{ name: 'Dinner', locationName: 'Shibuya' }]);

    await geocodePlanActivities(plan, 'pk.test');

    const asked = decodeURIComponent(String(fetchMock.mock.calls[1][0]));
    expect(asked).toContain('Shibuya');
    expect(asked).not.toContain('Dinner');
  });
});

describe('getPinActivities', () => {
  it('returns only activities with coordinates', () => {
    const pins = getPinActivities(mockPlan);
    // Only a1 and a2 have coordinates; a3 does not
    expect(pins).toHaveLength(2);
    expect(pins[0].activity.id).toBe('a1');
    expect(pins[1].activity.id).toBe('a2');
  });

  it('assigns correct sequence numbers per day', () => {
    const pins = getPinActivities(mockPlan);
    expect(pins[0].sequenceNumber).toBe(1);
    expect(pins[1].sequenceNumber).toBe(2);
  });

  it('assigns correct day color', () => {
    const pins = getPinActivities(mockPlan);
    expect(pins[0].dayColor).toBe('#06b6d4'); // DAY_COLORS[0]
  });

  it('returns empty array when no activities have coordinates', () => {
    const planNoCoords: Plan = {
      ...mockPlan,
      itinerary: [
        {
          dayIndex: 0,
          label: 'Day 1',
          activities: [
            { id: 'a1', name: 'Activity', time: '09:00', locationName: 'Place', notes: '', pinnedToTodo: false },
          ],
        },
      ],
    };
    expect(getPinActivities(planNoCoords)).toHaveLength(0);
  });
});

describe('haversineKm', () => {
  it('returns 0 for same point', () => {
    expect(haversineKm([139.69, 35.69], [139.69, 35.69])).toBe(0);
  });

  it('returns correct approximate distance', () => {
    // Tokyo to Osaka is approx 400km
    const dist = haversineKm([139.6917, 35.6895], [135.5022, 34.6937]);
    expect(dist).toBeGreaterThan(390);
    expect(dist).toBeLessThan(420);
  });
});

describe('totalRouteDistanceKm', () => {
  it('returns 0 for 0 or 1 coordinates', () => {
    expect(totalRouteDistanceKm([])).toBe(0);
    expect(totalRouteDistanceKm([[139.69, 35.69]])).toBe(0);
  });

  it('sums distances between consecutive points', () => {
    const coords: [number, number][] = [
      [139.6917, 35.6895],
      [139.7016, 35.658],
      [135.5022, 34.6937],
    ];
    const total = totalRouteDistanceKm(coords);
    const leg1 = haversineKm(coords[0], coords[1]);
    const leg2 = haversineKm(coords[1], coords[2]);
    expect(total).toBeCloseTo(leg1 + leg2, 5);
  });
});
