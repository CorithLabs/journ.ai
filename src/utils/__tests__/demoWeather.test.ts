import { describe, it, expect, beforeEach } from 'vitest';
import { withDemoRain } from '../demoWeather';
import { DEMO_PLAN_ID } from '../../db/seed';
import { hazardsFor } from '../weatherUtils';
import type { WeatherDay } from '../../store';

const plan = { id: 'demo', startDate: '2026-11-22' };
const day = (date: string, over: Partial<WeatherDay> = {}): WeatherDay => ({
  date, weatherCode: 1, tempMax: 16, tempMin: 9, precipProbability: 5, windspeedMax: 10, apparentTempMax: 15, ...over,
});

describe('the sample trip’s rainy day', () => {
  beforeEach(() => localStorage.clear());

  it('makes Day 2 rainy, and labelled simulated, when the forecast is dry', () => {
    localStorage.setItem(DEMO_PLAN_ID, 'demo');
    const out = withDemoRain(plan, { '2026-11-22': day('2026-11-22'), '2026-11-23': day('2026-11-23') })!;
    expect(out['2026-11-23'].simulated).toBe(true);
    expect(hazardsFor(out['2026-11-23'])).toEqual(['rain']);
    expect(out['2026-11-23'].tempMax).toBe(16); // keeps the real temperature
    expect(out['2026-11-22']).toEqual(day('2026-11-22')); // other days untouched
  });

  it('leaves a forecast that is already wet alone', () => {
    localStorage.setItem(DEMO_PLAN_ID, 'demo');
    const wet = { '2026-11-23': day('2026-11-23', { weatherCode: 61, precipProbability: 80 }) };
    expect(withDemoRain(plan, wet)).toBe(wet);
  });

  it('still has its rainy day when there is no forecast at all', () => {
    localStorage.setItem(DEMO_PLAN_ID, 'demo');
    expect(withDemoRain(plan, null)?.['2026-11-23'].simulated).toBe(true);
  });

  it('never touches any other trip', () => {
    localStorage.setItem(DEMO_PLAN_ID, 'someone-else');
    const w = { '2026-11-23': day('2026-11-23') };
    expect(withDemoRain(plan, w)).toBe(w);
    expect(withDemoRain(plan, null)).toBeNull();
  });
});
