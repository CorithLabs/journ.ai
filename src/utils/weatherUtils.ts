import { type WeatherDay } from '../store';

export type WeatherIconName =
  | 'Sun'
  | 'CloudRain'
  | 'CloudSnow'
  | 'CloudLightning'
  | 'Wind'
  | 'Cloud'
  | 'Thermometer';

export interface WeatherAlert {
  icon: WeatherIconName;
  label: string;
  emoji: string;
}

/** Map a WMO weather code to a lucide-react icon name */
export function wmoToIcon(code: number): WeatherIconName {
  if (code === 0) return 'Sun';
  if (code >= 1 && code <= 3) return 'Cloud'; // partly cloudy → cloud
  if (code >= 45 && code <= 48) return 'Cloud'; // fog
  if (code >= 51 && code <= 67) return 'CloudRain';
  if (code >= 71 && code <= 77) return 'CloudSnow';
  if (code >= 80 && code <= 82) return 'CloudRain';
  if (code >= 95 && code <= 99) return 'CloudLightning';
  return 'Sun';
}

/** Human-readable weather description from WMO code */
export function wmoToDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 56 && code <= 57) return 'Freezing drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

/**
 * Detect weather alerts for a day.
 * Returns an array of alerts (may be empty).
 */
export function detectAlerts(day: WeatherDay): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const { weatherCode, precipProbability, windspeedMax, tempMax, apparentTempMax } = day;

  const isRain =
    precipProbability >= 60 ||
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82);
  if (isRain) {
    alerts.push({ icon: 'CloudRain', label: 'Rain / Drizzle', emoji: '🌧' });
  }

  const isSnow = weatherCode >= 71 && weatherCode <= 77;
  if (isSnow) {
    alerts.push({ icon: 'CloudSnow', label: 'Snow', emoji: '❄️' });
  }

  const isStorm = weatherCode >= 95 && weatherCode <= 99;
  if (isStorm) {
    alerts.push({ icon: 'CloudLightning', label: 'Thunderstorm', emoji: '⛈' });
  }

  const isFog = weatherCode >= 45 && weatherCode <= 48;
  if (isFog) {
    alerts.push({ icon: 'Cloud', label: 'Fog / Low visibility', emoji: '🌫' });
  }

  if (windspeedMax >= 50) {
    alerts.push({ icon: 'Wind', label: 'High winds', emoji: '🌬' });
  }

  if (tempMax >= 38) {
    alerts.push({ icon: 'Thermometer', label: 'Heat warning', emoji: '🥵' });
  }

  if (apparentTempMax - tempMax >= 5) {
    alerts.push({ icon: 'Thermometer', label: 'High humidity', emoji: '💧' });
  }

  return alerts;
}

/** Convert Celsius to Fahrenheit */
export function toFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}
