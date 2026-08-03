import { describe, it, expect } from 'vitest';
import { wmoToIcon, detectAlerts, toFahrenheit, wmoToDescription } from '../weatherUtils';
import { type WeatherDay } from '../../store';

const baseDay: WeatherDay = {
  date: '2025-07-14',
  weatherCode: 0,
  tempMax: 25,
  tempMin: 15,
  precipProbability: 10,
  windspeedMax: 20,
  apparentTempMax: 27,
};

describe('wmoToIcon', () => {
  it('returns Sun for code 0 (clear)', () => {
    expect(wmoToIcon(0)).toBe('Sun');
  });
  it('returns Cloud for codes 1–3 (partly cloudy)', () => {
    expect(wmoToIcon(1)).toBe('Cloud');
    expect(wmoToIcon(3)).toBe('Cloud');
  });
  it('returns Cloud for codes 45–48 (fog)', () => {
    expect(wmoToIcon(45)).toBe('Cloud');
    expect(wmoToIcon(48)).toBe('Cloud');
  });
  it('returns CloudRain for codes 51–67 (drizzle/rain)', () => {
    expect(wmoToIcon(51)).toBe('CloudRain');
    expect(wmoToIcon(67)).toBe('CloudRain');
  });
  it('returns CloudSnow for codes 71–77 (snow)', () => {
    expect(wmoToIcon(71)).toBe('CloudSnow');
    expect(wmoToIcon(77)).toBe('CloudSnow');
  });
  it('returns CloudRain for codes 80–82 (showers)', () => {
    expect(wmoToIcon(80)).toBe('CloudRain');
    expect(wmoToIcon(82)).toBe('CloudRain');
  });
  it('returns CloudLightning for codes 95–99 (thunderstorm)', () => {
    expect(wmoToIcon(95)).toBe('CloudLightning');
    expect(wmoToIcon(99)).toBe('CloudLightning');
  });
});

describe('wmoToDescription', () => {
  it('returns "Clear sky" for code 0', () => {
    expect(wmoToDescription(0)).toBe('Clear sky');
  });
  it('returns "Thunderstorm" for codes 95–99', () => {
    expect(wmoToDescription(95)).toBe('Thunderstorm');
    expect(wmoToDescription(99)).toBe('Thunderstorm');
  });
  it('returns "Rain" for code 61', () => {
    expect(wmoToDescription(61)).toBe('Rain');
  });
  it('returns "Snow" for code 71', () => {
    expect(wmoToDescription(71)).toBe('Snow');
  });
});

describe('detectAlerts', () => {
  it('returns empty array for a clear, benign day', () => {
    const alerts = detectAlerts(baseDay);
    expect(alerts).toHaveLength(0);
  });

  it('detects Rain alert when precipProbability >= 60', () => {
    const alerts = detectAlerts({ ...baseDay, precipProbability: 60 });
    expect(alerts.some(a => a.label === 'Rain / Drizzle')).toBe(true);
  });

  it('detects Rain alert from weatherCode 55 (drizzle)', () => {
    const alerts = detectAlerts({ ...baseDay, weatherCode: 55 });
    expect(alerts.some(a => a.label === 'Rain / Drizzle')).toBe(true);
  });

  it('detects Rain alert from weatherCode 80 (showers)', () => {
    const alerts = detectAlerts({ ...baseDay, weatherCode: 80 });
    expect(alerts.some(a => a.label === 'Rain / Drizzle')).toBe(true);
  });

  it('detects Snow alert from weatherCode 71', () => {
    const alerts = detectAlerts({ ...baseDay, weatherCode: 71 });
    expect(alerts.some(a => a.label === 'Snow')).toBe(true);
  });

  it('detects Thunderstorm alert from weatherCode 95', () => {
    const alerts = detectAlerts({ ...baseDay, weatherCode: 95 });
    expect(alerts.some(a => a.label === 'Thunderstorm')).toBe(true);
  });

  it('detects Fog alert from weatherCode 45', () => {
    const alerts = detectAlerts({ ...baseDay, weatherCode: 45 });
    expect(alerts.some(a => a.label === 'Fog / Low visibility')).toBe(true);
  });

  it('detects High winds alert when windspeedMax >= 50', () => {
    const alerts = detectAlerts({ ...baseDay, windspeedMax: 50 });
    expect(alerts.some(a => a.label === 'High winds')).toBe(true);
  });

  it('does NOT detect High winds when windspeedMax = 49', () => {
    const alerts = detectAlerts({ ...baseDay, windspeedMax: 49 });
    expect(alerts.some(a => a.label === 'High winds')).toBe(false);
  });

  it('detects Heat warning when tempMax >= 38°C', () => {
    const alerts = detectAlerts({ ...baseDay, tempMax: 38 });
    expect(alerts.some(a => a.label === 'Heat warning')).toBe(true);
  });

  it('detects High humidity when apparentTempMax - tempMax >= 5', () => {
    const alerts = detectAlerts({ ...baseDay, tempMax: 28, apparentTempMax: 34 });
    expect(alerts.some(a => a.label === 'High humidity')).toBe(true);
  });

  it('does NOT detect High humidity when difference < 5', () => {
    const alerts = detectAlerts({ ...baseDay, tempMax: 28, apparentTempMax: 32 });
    expect(alerts.some(a => a.label === 'High humidity')).toBe(false);
  });

  it('can detect multiple alerts simultaneously', () => {
    const alerts = detectAlerts({
      ...baseDay,
      weatherCode: 95,  // thunderstorm
      windspeedMax: 60, // high winds
      tempMax: 40,      // heat
    });
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(alerts.some(a => a.label === 'Thunderstorm')).toBe(true);
    expect(alerts.some(a => a.label === 'High winds')).toBe(true);
  });
});

describe('toFahrenheit', () => {
  it('converts 0°C to 32°F', () => {
    expect(toFahrenheit(0)).toBe(32);
  });
  it('converts 100°C to 212°F', () => {
    expect(toFahrenheit(100)).toBe(212);
  });
  it('converts 20°C to 68°F', () => {
    expect(toFahrenheit(20)).toBe(68);
  });
  it('converts 37°C to 99°F (rounded)', () => {
    expect(toFahrenheit(37)).toBe(99);
  });
});
