import type { Plan } from '../db';
import type { WeatherDay } from '../store';
import { DEMO_PLAN_ID } from '../db/seed';
import { dateForDayIndex } from './tripDay';
import { hazardsFor } from './weatherUtils';

/**
 * The sample trip's rainy day.
 *
 * The sample is there to show what the app does, and the most useful thing it
 * does with weather — spot a wet day with outdoor plans and offer to swap or
 * replace them — only appears when it actually rains. Real Tokyo is often dry,
 * so on the sample trip Day 2 (a shrine walk and a garden) is shown as rainy
 * whenever the forecast is not already wet. Marked `simulated`, so it is
 * labelled as such and never mistaken for the forecast.
 */
export const DEMO_RAIN_DAY_INDEX = 1;

export function isDemoPlan(planId: string | undefined): boolean {
  if (!planId) return false;
  try {
    return localStorage.getItem(DEMO_PLAN_ID) === planId;
  } catch {
    return false;
  }
}

export function withDemoRain(
  plan: Pick<Plan, 'id' | 'startDate'>,
  weather: Record<string, WeatherDay> | null,
): Record<string, WeatherDay> | null {
  if (!isDemoPlan(plan.id)) return weather;
  const date = dateForDayIndex(plan.startDate, DEMO_RAIN_DAY_INDEX);
  if (!date) return weather;

  const real = weather?.[date];
  // Already wet: the real forecast shows the feature by itself.
  if (real && hazardsFor(real).some((h) => h === 'rain' || h === 'storm')) return weather;

  const tempMax = real?.tempMax ?? 15;
  const rain: WeatherDay = {
    date,
    weatherCode: 63, // moderate rain
    tempMax,
    tempMin: real?.tempMin ?? tempMax - 6,
    precipProbability: 90,
    windspeedMax: Math.min(real?.windspeedMax ?? 15, 30),
    // Feels like the temperature: rain is the story, not humidity.
    apparentTempMax: tempMax,
    simulated: true,
  };
  return { ...(weather ?? {}), [date]: rain };
}
