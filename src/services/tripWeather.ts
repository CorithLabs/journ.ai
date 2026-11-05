import type { Plan } from '../db';
import type { WeatherDay } from '../store';
import { lookupCity } from './cityLookup';
import { fetchWeather, isBeyondForecast } from './weather';
import { getTempUnit } from './units';
import { wmoToDescription } from '../utils/weatherUtils';
import { shortDate } from '../utils/dateText';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const YEARS_BACK = 3;

/** What the same dates were like in recent years: the best guess past a forecast. */
export interface TypicalWeather {
  years: number;
  avgHigh: number;
  avgLow: number;
  /** Share of days with at least 1 mm of rain or snow. */
  wetShare: number;
  /** Share of days with snow. */
  snowShare: number;
  maxWind: number;
}

export type TripWeather =
  | { basis: 'forecast'; place: string; days: WeatherDay[] }
  | { basis: 'typical'; place: string; startDate: string; endDate: string; typical: TypicalWeather }
  | { basis: 'none'; place: string };

function shiftYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  // 29 Feb in a year without one becomes 28 Feb.
  const day = Math.min(d, new Date(Date.UTC(y - years, m, 0)).getUTCDate());
  return `${y - years}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface ArchiveResponse {
  daily?: {
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    snowfall_sum?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
  };
}

/** The same dates over the last few years, from Open-Meteo's historical record. */
export async function typicalWeather(
  coords: [number, number],
  startDate: string,
  endDate: string,
): Promise<TypicalWeather | null> {
  const years = await Promise.all(
    Array.from({ length: YEARS_BACK }, async (_, i) => {
      try {
        const params = new URLSearchParams({
          latitude: String(coords[1]),
          longitude: String(coords[0]),
          start_date: shiftYears(startDate, i + 1),
          end_date: shiftYears(endDate, i + 1),
          daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max',
          timezone: 'auto',
        });
        const resp = await fetch(`${ARCHIVE_URL}?${params}`);
        if (!resp.ok) return null;
        return ((await resp.json()) as ArchiveResponse).daily ?? null;
      } catch {
        return null;
      }
    }),
  );
  const got = years.filter((y): y is NonNullable<typeof y> => !!y?.temperature_2m_max?.length);
  if (!got.length) return null;

  const nums = (k: keyof NonNullable<ArchiveResponse['daily']>) =>
    got.flatMap((y) => (y[k] ?? []).filter((v): v is number => typeof v === 'number'));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const precip = nums('precipitation_sum');
  const snow = nums('snowfall_sum');
  return {
    years: got.length,
    avgHigh: avg(nums('temperature_2m_max')),
    avgLow: avg(nums('temperature_2m_min')),
    wetShare: precip.length ? precip.filter((p) => p >= 1).length / precip.length : 0,
    snowShare: snow.length ? snow.filter((s) => s > 0).length / snow.length : 0,
    maxWind: Math.max(0, ...nums('wind_speed_10m_max')),
  };
}

/**
 * The weather for a place and dates: the forecast when it reaches that far
 * (about sixteen days), otherwise what those dates were like in recent years.
 */
export async function weatherFor(place: string, startDate: string, endDate: string): Promise<TripWeather> {
  const city = await lookupCity(place);
  if (!city) return { basis: 'none', place };
  const label = city.name;
  if (!isBeyondForecast(startDate)) {
    const days = await fetchWeather(city.coordinates[1], city.coordinates[0], startDate, endDate);
    if (days && Object.keys(days).length) {
      return { basis: 'forecast', place: label, days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)) };
    }
  }
  const typical = await typicalWeather(city.coordinates, startDate, endDate);
  return typical ? { basis: 'typical', place: label, startDate, endDate, typical } : { basis: 'none', place: label };
}

export function tripWeather(plan: Pick<Plan, 'destination' | 'startDate' | 'endDate'>): Promise<TripWeather> {
  return weatherFor(plan.destination, plan.startDate, plan.endDate);
}

const deg = (c: number) => {
  const unit = getTempUnit();
  return `${Math.round(unit === 'F' ? c * 9 / 5 + 32 : c)}°${unit}`;
};

/** What to pack for it: the to-dos worth offering. */
export function packingFor(w: TripWeather): string[] {
  if (w.basis === 'none') return [];
  const out: string[] = [];
  const wet = w.basis === 'forecast' ? w.days.some((d) => d.precipProbability >= 50) : w.typical.wetShare >= 0.3;
  const snow = w.basis === 'forecast' ? w.days.some((d) => [71, 73, 75, 77, 85, 86].includes(d.weatherCode)) : w.typical.snowShare >= 0.15;
  const low = w.basis === 'forecast' ? Math.min(...w.days.map((d) => d.tempMin)) : w.typical.avgLow;
  const high = w.basis === 'forecast' ? Math.max(...w.days.map((d) => d.tempMax)) : w.typical.avgHigh;
  if (wet) out.push('Pack an umbrella or rain jacket');
  if (snow) out.push('Pack waterproof boots');
  if (low <= 5) out.push('Pack warm layers');
  if (high >= 28) out.push('Pack sunscreen and a hat');
  return out;
}

/** A short account of the weather, in the app's temperature unit. */
export function describeWeather(w: TripWeather): string {
  if (w.basis === 'none') return `I couldn't get the weather for ${w.place}.`;
  if (w.basis === 'forecast') {
    const lines = w.days.map((d) => {
      const rain = d.precipProbability >= 30 ? `, ${d.precipProbability}% chance of rain` : '';
      return `- ${shortDate(d.date)}: ${deg(d.tempMax)} / ${deg(d.tempMin)}, ${wmoToDescription(d.weatherCode).toLowerCase()}${rain}`;
    });
    return [`**Forecast for ${w.place}**`, ...lines].join('\n');
  }
  const t = w.typical;
  const share = (x: number) => (x >= 0.6 ? 'most days' : x >= 0.3 ? `about ${Math.round(x * 10)} days in 10` : x > 0.05 ? 'now and then' : 'rarely');
  const range = `${shortDate(w.startDate)}${w.endDate !== w.startDate ? ` – ${shortDate(w.endDate)}` : ''}`;
  return [
    `**What ${w.place} is usually like, ${range}**`,
    `- Highs around ${deg(t.avgHigh)}, lows around ${deg(t.avgLow)}`,
    `- Rain or snow ${share(t.wetShare)}${t.snowShare >= 0.15 ? `, with snow ${share(t.snowShare)}` : ''}`,
    `_Based on the same dates over the last ${t.years} ${t.years === 1 ? 'year' : 'years'}; a forecast comes about two weeks out._`,
  ].join('\n');
}
