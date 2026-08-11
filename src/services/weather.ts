import { type WeatherDay } from '../store';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const MAX_FORECAST_DAYS = 16;

/**
 * Whether a date is further ahead than anyone can forecast.
 *
 * Open-Meteo goes about sixteen days out. Beyond that there is no forecast to
 * be had, which is a different thing from one failing to arrive — and worth
 * saying, because an itinerary with no weather on it otherwise looks broken.
 */
export function isBeyondForecast(startDate: string, now: Date = new Date()): boolean {
  const start = Date.parse(`${startDate?.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start)) return false;
  return (start - today) / 86400000 > MAX_FORECAST_DAYS;
}

interface OpenMeteoResponse {
  daily: {
    time: string[];
    weathercode: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    windspeed_10m_max: number[];
    apparent_temperature_max: number[];
  };
}

/**
 * Geocode a destination string to [lng, lat] using Mapbox Geocoding API.
 * Returns null if token is missing, destination is empty, or geocoding fails.
 */
export async function geocodeDestination(
  destination: string,
  mapboxToken: string | null,
): Promise<[number, number] | null> {
  if (!destination || !mapboxToken) return null;
  try {
    const encoded = encodeURIComponent(destination);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&types=place,region,country&limit=1`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      features?: { center?: [number, number] }[];
    };
    const center = data.features?.[0]?.center;
    if (!center || center.length < 2) return null;
    return [center[0], center[1]];
  } catch {
    return null;
  }
}

/**
 * Clamp endDate to at most MAX_FORECAST_DAYS from startDate.
 */
function clampEndDate(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const maxEnd = new Date(start);
  maxEnd.setDate(maxEnd.getDate() + MAX_FORECAST_DAYS - 1);
  return end <= maxEnd ? endDate : maxEnd.toISOString().slice(0, 10);
}

/**
 * Fetch weather data from Open-Meteo for the given coordinates and date range.
 * Returns a map of ISO date string → WeatherDay, or null if fetch fails.
 * Silently returns null on any error (offline, network, invalid response).
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<Record<string, WeatherDay> | null> {
  try {
    const clampedEnd = clampEndDate(startDate, endDate);
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      daily: [
        'weathercode',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_probability_max',
        'windspeed_10m_max',
        'apparent_temperature_max',
      ].join(','),
      timezone: 'auto',
      start_date: startDate,
      end_date: clampedEnd,
    });

    const resp = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
    if (!resp.ok) return null;

    const data = (await resp.json()) as OpenMeteoResponse;
    const daily = data?.daily;
    if (!daily?.time?.length) return null;

    const result: Record<string, WeatherDay> = {};
    for (let i = 0; i < daily.time.length; i++) {
      const date = daily.time[i];
      result[date] = {
        date,
        weatherCode: daily.weathercode?.[i] ?? 0,
        tempMax: daily.temperature_2m_max?.[i] ?? 0,
        tempMin: daily.temperature_2m_min?.[i] ?? 0,
        precipProbability: daily.precipitation_probability_max?.[i] ?? 0,
        windspeedMax: daily.windspeed_10m_max?.[i] ?? 0,
        apparentTempMax: daily.apparent_temperature_max?.[i] ?? 0,
      };
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Full weather fetch pipeline:
 * 1. Geocode the destination (requires Mapbox token)
 * 2. Fetch Open-Meteo forecast for those coordinates
 *
 * Returns null silently if any step fails.
 */
export async function fetchWeatherForPlan(
  destination: string,
  startDate: string,
  endDate: string,
  mapboxToken: string | null,
): Promise<Record<string, WeatherDay> | null> {
  const coords = await geocodeDestination(destination, mapboxToken);
  if (!coords) return null;
  return fetchWeather(coords[1], coords[0], startDate, endDate);
}

/**
 * A forecast per city, for a trip that visits more than one.
 *
 * Weather is a city, not a coordinate: a Tokyo forecast says nothing about
 * the day spent in Osaka, 400km away. Each city is geocoded and forecast
 * once, and the days assigned to it take its numbers.
 *
 * A city that fails to geocode leaves its days without a forecast rather than
 * borrowing another city's, since a wrong forecast is worse than none — it is
 * what an alert would then be reasoning from.
 */
export async function fetchWeatherByCity(
  cityForDate: Record<string, string>,
  startDate: string,
  endDate: string,
  mapboxToken: string | null,
): Promise<Record<string, WeatherDay> | null> {
  const cities = [...new Set(Object.values(cityForDate))];
  if (!cities.length) return null;

  const out: Record<string, WeatherDay> = {};
  for (const city of cities) {
    const coords = await geocodeDestination(city, mapboxToken);
    if (!coords) continue;
    const forecast = await fetchWeather(coords[1], coords[0], startDate, endDate);
    if (!forecast) continue;
    for (const [date, assigned] of Object.entries(cityForDate)) {
      if (assigned === city && forecast[date]) out[date] = forecast[date];
    }
  }
  return Object.keys(out).length ? out : null;
}
