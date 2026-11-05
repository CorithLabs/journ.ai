import { describe, it, expect, vi, beforeEach } from 'vitest';
import { describeWeather, packingFor, typicalWeather, weatherFor, type TripWeather } from '../tripWeather';
import { lookupCity } from '../cityLookup';

vi.mock('../cityLookup', () => ({ lookupCity: vi.fn() }));

const day = (date: string, max: number, min: number, rain: number, code = 3) => ({
  date, weatherCode: code, tempMax: max, tempMin: min, precipProbability: rain, windspeedMax: 10, apparentTempMax: max,
});

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('what to pack for the weather', () => {
  it('offers rain gear and warm layers for a wet, cold forecast', () => {
    const w: TripWeather = { basis: 'forecast', place: 'Tokyo', days: [day('2026-11-09', 11, 4, 62), day('2026-11-10', 13, 7, 10)] };
    expect(packingFor(w)).toEqual(['Pack an umbrella or rain jacket', 'Pack warm layers']);
  });

  it('offers sun protection for a hot spell, and nothing for a mild dry one', () => {
    expect(packingFor({ basis: 'forecast', place: 'Seville', days: [day('2026-07-01', 36, 22, 0, 0)] })).toEqual(['Pack sunscreen and a hat']);
    expect(packingFor({ basis: 'forecast', place: 'Lisbon', days: [day('2026-05-01', 22, 14, 5, 1)] })).toEqual([]);
  });

  it('reads typical weather the same way', () => {
    const w: TripWeather = { basis: 'typical', place: 'Kyoto', startDate: '2027-04-01', endDate: '2027-04-05', typical: { years: 3, avgHigh: 18, avgLow: 7, wetShare: 0.4, snowShare: 0, maxWind: 20 } };
    expect(packingFor(w)).toEqual(['Pack an umbrella or rain jacket']);
    expect(describeWeather(w)).toMatch(/usually like/);
    expect(describeWeather(w)).toMatch(/about 4 days in 10/);
  });

  it('describes a forecast day by day', () => {
    const text = describeWeather({ basis: 'forecast', place: 'Tokyo', days: [day('2026-11-09', 11, 4, 62)] });
    expect(text).toMatch(/Forecast for Tokyo/);
    expect(text).toMatch(/62% chance of rain/);
  });
});

/*
 * Past a forecast, the same dates over recent years are the best guess, from
 * Open-Meteo's historical record.
 */
describe('typical weather', () => {
  it('averages the same dates over the last three years', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ daily: { temperature_2m_max: [20, 22], temperature_2m_min: [10, 12], precipitation_sum: [0, 5], snowfall_sum: [0, 0], wind_speed_10m_max: [15, 30] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const t = await typicalWeather([135.77, 35.01], '2027-04-01', '2027-04-02');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain('start_date=2026-04-01');
    expect(String(fetchMock.mock.calls[2][0])).toContain('start_date=2024-04-01');
    expect(t).toMatchObject({ years: 3, avgHigh: 21, avgLow: 11, wetShare: 0.5, maxWind: 30 });
    vi.unstubAllGlobals();
  });

  it('uses the record, not a forecast, for a trip months away', async () => {
    vi.mocked(lookupCity).mockResolvedValue({ name: 'Kyoto', region: null, country: 'Japan', coordinates: [135.77, 35.01], label: 'Kyoto, Japan' });
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes('archive') ? { daily: { temperature_2m_max: [18], temperature_2m_min: [8], precipitation_sum: [0], snowfall_sum: [0], wind_speed_10m_max: [10] } } : {}),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const w = await weatherFor('Kyoto', '2030-04-01', '2030-04-01');
    expect(w.basis).toBe('typical');
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes('archive'))).toBe(true);
    vi.unstubAllGlobals();
  });
});
