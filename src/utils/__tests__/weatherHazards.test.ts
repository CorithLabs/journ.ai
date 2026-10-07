import { describe, it, expect } from 'vitest';
import type { WeatherDay } from '../../store';
import { hazardsFor } from '../weatherUtils';

const day = (over: Partial<WeatherDay>): WeatherDay => ({
  date: '2026-10-10', weatherCode: 1, tempMax: 20, tempMin: 12,
  precipProbability: 10, windspeedMax: 15, apparentTempMax: 20, ...over,
});

describe('what the weather can do to time outdoors', () => {
  it('is nothing on a fine day', () => {
    expect(hazardsFor(day({}))).toEqual([]);
  });

  it('calls a likely-wet day rain', () => {
    expect(hazardsFor(day({ precipProbability: 70 }))).toEqual(['rain']);
  });

  it('calls high wind wind, at the same threshold as the alerts', () => {
    expect(hazardsFor(day({ windspeedMax: 49 }))).toEqual([]);
    expect(hazardsFor(day({ windspeedMax: 50 }))).toEqual(['wind']);
  });

  // A snow day nearly always clears the rain threshold as well; calling it
  // both reads as two problems.
  it('calls snow snow, not rain as well', () => {
    expect(hazardsFor(day({ weatherCode: 73, precipProbability: 80 }))).toEqual(['snow']);
  });

  it('leads with the worst', () => {
    expect(hazardsFor(day({ weatherCode: 95, precipProbability: 80, windspeedMax: 60 }))).toEqual(['storm', 'rain', 'wind']);
  });

  // Heat is worth an alert, but it does not close a viewpoint.
  it('leaves heat to the alerts', () => {
    expect(hazardsFor(day({ tempMax: 40, apparentTempMax: 40 }))).toEqual([]);
  });
});
