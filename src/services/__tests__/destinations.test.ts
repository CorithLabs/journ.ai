import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchDestinations,
  isPlausibleDestination,
} from '../destinations';
import { MAPBOX_TOKEN_KEY } from '../mapbox';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mapboxResponse = (features: unknown[]) =>
  ({ ok: true, status: 200, json: async () => ({ features }) }) as unknown as Response;

describe('isPlausibleDestination', () => {
  it('rejects numbers and punctuation, which used to be accepted as cities', () => {
    expect(isPlausibleDestination('12345')).toBe(false);
    expect(isPlausibleDestination('!!!')).toBe(false);
    expect(isPlausibleDestination('  ')).toBe(false);
    expect(isPlausibleDestination('7')).toBe(false);
  });

  it('accepts real place names, including non-Latin scripts and accents', () => {
    expect(isPlausibleDestination('Tokyo')).toBe(true);
    expect(isPlausibleDestination('Toronto, Canada')).toBe(true);
    expect(isPlausibleDestination('Zürich')).toBe(true);
    expect(isPlausibleDestination('東京')).toBe(true);
  });

  it('accepts a name that contains digits, e.g. a numbered arrondissement', () => {
    expect(isPlausibleDestination('Paris 15')).toBe(true);
  });
});

describe('searchDestinations', () => {
  it('returns nothing for a query below two characters', async () => {
    expect(await searchDestinations('t')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('without a Mapbox token', () => {
    it('falls back to the bundled list and still supplies a country', async () => {
      const hits = await searchDestinations('tok');
      expect(hits[0]).toEqual({ city: 'Tokyo', country: 'Japan', label: 'Tokyo, Japan' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('matches on country as well as city, so "canada" finds Canadian cities', async () => {
      const hits = await searchDestinations('canada');
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every((h) => h.country === 'Canada')).toBe(true);
    });

    it('knows Toronto is in Canada — the case the visa to-do got wrong', async () => {
      const hits = await searchDestinations('toronto');
      expect(hits[0].country).toBe('Canada');
    });
  });

  describe('with a Mapbox token', () => {
    beforeEach(() => localStorage.setItem(MAPBOX_TOKEN_KEY, 'pk.test'));

    it('extracts the country from the feature context chain', async () => {
      fetchMock.mockResolvedValueOnce(
        mapboxResponse([
          {
            text: 'Toronto',
            place_name: 'Toronto, Ontario, Canada',
            place_type: ['place'],
            context: [{ id: 'region.123', text: 'Ontario' }, { id: 'country.456', text: 'Canada' }],
          },
        ]),
      );
      const hits = await searchDestinations('toronto');
      expect(hits[0]).toEqual({
        city: 'Toronto',
        country: 'Canada',
        label: 'Toronto, Ontario, Canada',
      });
    });

    it('handles a country-level result, where the country is the feature itself', async () => {
      fetchMock.mockResolvedValueOnce(
        mapboxResponse([{ text: 'Japan', place_name: 'Japan', place_type: ['country'] }]),
      );
      expect((await searchDestinations('japan'))[0].country).toBe('Japan');
    });

    // A lookup failure must never block plan creation.
    it('falls back to the bundled list when the request fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));
      const hits = await searchDestinations('tokyo');
      expect(hits[0].city).toBe('Tokyo');
    });

    it('falls back on a non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as unknown as Response);
      expect((await searchDestinations('tokyo'))[0].city).toBe('Tokyo');
    });

    it('falls back when Mapbox returns no features', async () => {
      fetchMock.mockResolvedValueOnce(mapboxResponse([]));
      expect((await searchDestinations('tokyo'))[0].city).toBe('Tokyo');
    });

    it('reports a null country rather than guessing when context has none', async () => {
      fetchMock.mockResolvedValueOnce(
        mapboxResponse([{ text: 'Atlantis', place_name: 'Atlantis', place_type: ['place'] }]),
      );
      expect((await searchDestinations('atlantis'))[0].country).toBeNull();
    });
  });
});
