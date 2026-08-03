import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWeather, geocodeDestination, fetchWeatherForPlan } from '../weather';

const MOCK_GEOCODE_RESPONSE = {
  features: [{ center: [139.6917, 35.6895] }],
};

const MOCK_WEATHER_RESPONSE = {
  daily: {
    time: ['2025-07-14', '2025-07-15'],
    weathercode: [0, 61],
    temperature_2m_max: [30, 25],
    temperature_2m_min: [22, 18],
    precipitation_probability_max: [10, 70],
    windspeed_10m_max: [20, 45],
    apparent_temperature_max: [32, 28],
  },
};

describe('geocodeDestination', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no token is provided', async () => {
    const result = await geocodeDestination('Tokyo', null);
    expect(result).toBeNull();
  });

  it('returns null when destination is empty', async () => {
    const result = await geocodeDestination('', 'pk.test-token');
    expect(result).toBeNull();
  });

  it('returns coordinates when geocoding succeeds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_GEOCODE_RESPONSE,
    } as Response);

    const result = await geocodeDestination('Tokyo', 'pk.test-token');
    expect(result).toEqual([139.6917, 35.6895]);
  });

  it('returns null when geocoding returns no features', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [] }),
    } as Response);

    const result = await geocodeDestination('NonExistentPlace', 'pk.test-token');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
    const result = await geocodeDestination('Tokyo', 'pk.test-token');
    expect(result).toBeNull();
  });
});

describe('fetchWeather', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed WeatherDay map on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_WEATHER_RESPONSE,
    } as Response);

    const result = await fetchWeather(35.6895, 139.6917, '2025-07-14', '2025-07-15');
    expect(result).not.toBeNull();
    expect(result!['2025-07-14']).toEqual({
      date: '2025-07-14',
      weatherCode: 0,
      tempMax: 30,
      tempMin: 22,
      precipProbability: 10,
      windspeedMax: 20,
      apparentTempMax: 32,
    });
    expect(result!['2025-07-15']).toEqual({
      date: '2025-07-15',
      weatherCode: 61,
      tempMax: 25,
      tempMin: 18,
      precipProbability: 70,
      windspeedMax: 45,
      apparentTempMax: 28,
    });
  });

  it('clamps end date to 16 days from start', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_WEATHER_RESPONSE,
    } as Response);

    await fetchWeather(35.6895, 139.6917, '2025-07-01', '2025-09-30');

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    const params = new URLSearchParams(calledUrl.split('?')[1]);
    // Start: 2025-07-01, end should be at most 2025-07-16 (16 days ahead)
    const endDate = params.get('end_date');
    expect(endDate).toBe('2025-07-16');
  });

  it('returns null on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    const result = await fetchWeather(35.6895, 139.6917, '2025-07-14', '2025-07-15');
    expect(result).toBeNull();
  });

  it('returns null when response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);
    const result = await fetchWeather(35.6895, 139.6917, '2025-07-14', '2025-07-15');
    expect(result).toBeNull();
  });
});

describe('fetchWeatherForPlan', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no Mapbox token is provided', async () => {
    const result = await fetchWeatherForPlan('Tokyo', '2025-07-14', '2025-07-15', null);
    expect(result).toBeNull();
  });

  it('returns weather data when geocoding and fetch both succeed', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_GEOCODE_RESPONSE,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_WEATHER_RESPONSE,
      } as Response);

    const result = await fetchWeatherForPlan('Tokyo', '2025-07-14', '2025-07-15', 'pk.test');
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toHaveLength(2);
  });

  it('returns null when geocoding fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [] }),
    } as Response);

    const result = await fetchWeatherForPlan(
      'UnknownPlace',
      '2025-07-14',
      '2025-07-15',
      'pk.test',
    );
    expect(result).toBeNull();
  });
});
