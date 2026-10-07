import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchDestinations,
  isPlausibleDestination,
} from '../destinations';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const cityResponse = (results: unknown[]) =>
  ({ ok: true, status: 200, json: async () => ({ results }) }) as unknown as Response;

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

  // Offline, the bundled list stands in so a plan can still be started.
  describe('when the search cannot be reached', () => {
    beforeEach(() => {
      fetchMock.mockRejectedValue(new Error('offline'));
    });

    it('falls back to the bundled list and still supplies a country', async () => {
      const hits = await searchDestinations('tok');
      expect(hits[0]).toEqual({ city: 'Tokyo', country: 'Japan', label: 'Tokyo, Japan' });
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

  describe('from Open-Meteo', () => {
    it('needs no key', async () => {
      fetchMock.mockResolvedValueOnce(cityResponse([]));
      await searchDestinations('toronto');
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('geocoding-api.open-meteo.com');
      expect(url).not.toMatch(/token|key=/i);
    });

    it('labels a city with its region and country, and keeps the country apart', async () => {
      fetchMock.mockResolvedValueOnce(cityResponse([
        { name: 'Toronto', admin1: 'Ontario', country: 'Canada', latitude: 43.7, longitude: -79.4, feature_code: 'PPLA' },
      ]));
      expect((await searchDestinations('toronto'))[0]).toEqual({
        city: 'Toronto',
        country: 'Canada',
        label: 'Toronto, Ontario, Canada',
      });
    });

    it('handles a country, where the country is the place itself', async () => {
      fetchMock.mockResolvedValueOnce(cityResponse([
        { name: 'Japan', country: 'Japan', latitude: 35.7, longitude: 139.8, feature_code: 'PCLI' },
      ]));
      const [japan] = await searchDestinations('japan');
      expect(japan).toEqual({ city: 'Japan', country: 'Japan', label: 'Japan' });
    });

    // "Tokyo Heliport" and "Banff Airport" are not where anyone is going.
    it('leaves out airports, mountains and parks that share a name', async () => {
      fetchMock.mockResolvedValueOnce(cityResponse([
        { name: 'Banff', admin1: 'Alberta', country: 'Canada', latitude: 51.2, longitude: -115.6, feature_code: 'PPL' },
        { name: 'Banff Airport', admin1: 'Alberta', country: 'Canada', latitude: 51.2, longitude: -115.5, feature_code: 'AIRP' },
      ]));
      expect((await searchDestinations('banff')).map((h) => h.city)).toEqual(['Banff']);
    });

    // Copenhagen and Lund are 40km apart across a border; England has a Lund too.
    it('puts the place matching a typed country first', async () => {
      fetchMock.mockResolvedValueOnce(cityResponse([
        { name: 'Lund', admin1: 'England', country: 'United Kingdom', latitude: 53.9, longitude: -0.5, feature_code: 'PPL' },
        { name: 'Lund', admin1: 'Skåne County', country: 'Sweden', latitude: 55.7, longitude: 13.2, feature_code: 'PPLA2' },
      ]));
      expect((await searchDestinations('Lund, Sweden'))[0].country).toBe('Sweden');
    });

    // A lookup failure must never block plan creation.
    it('falls back on a non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
      expect((await searchDestinations('tokyo'))[0].city).toBe('Tokyo');
    });

    it('falls back when nothing is found', async () => {
      fetchMock.mockResolvedValueOnce(cityResponse([]));
      expect((await searchDestinations('tokyo'))[0].city).toBe('Tokyo');
    });

    it('reports a null country rather than guessing when there is none', async () => {
      fetchMock.mockResolvedValueOnce(cityResponse([
        { name: 'Atlantis', latitude: 0, longitude: 0, feature_code: 'PPL' },
      ]));
      expect((await searchDestinations('atlantis'))[0].country).toBeNull();
    });
  });
});
