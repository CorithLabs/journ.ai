import {
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind,
  Cloud,
  Thermometer,
} from 'lucide-react';
import { type WeatherDay } from '../../store';
import { wmoToIcon, wmoToDescription, toFahrenheit } from '../../utils/weatherUtils';

interface Props {
  weather: WeatherDay;
  useFahrenheit: boolean;
  isToday: boolean;
}

function WeatherIcon({ name, size = 14 }: { name: string; size?: number }) {
  switch (name) {
    case 'Sun':
      return <Sun size={size} aria-hidden="true" />;
    case 'CloudRain':
      return <CloudRain size={size} aria-hidden="true" />;
    case 'CloudSnow':
      return <CloudSnow size={size} aria-hidden="true" />;
    case 'CloudLightning':
      return <CloudLightning size={size} aria-hidden="true" />;
    case 'Wind':
      return <Wind size={size} aria-hidden="true" />;
    case 'Cloud':
      return <Cloud size={size} aria-hidden="true" />;
    case 'Thermometer':
      return <Thermometer size={size} aria-hidden="true" />;
    default:
      return <Sun size={size} aria-hidden="true" />;
  }
}

export default function WeatherStrip({ weather, useFahrenheit, isToday }: Props) {
  const iconName = wmoToIcon(weather.weatherCode);
  const description = wmoToDescription(weather.weatherCode);

  const displayTemp = (c: number) =>
    useFahrenheit ? `${toFahrenheit(c)}°F` : `${Math.round(c)}°C`;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded-xl text-xs mt-1 mb-2 ${
        isToday
          ? 'bg-accent/10 border border-accent/30 shadow-glow'
          : 'bg-surface-raised border border-white/5'
      }`}
      data-testid="weather-strip"
      aria-label={`Weather: ${description}, high ${displayTemp(weather.tempMax)}, low ${displayTemp(weather.tempMin)}, precipitation ${weather.precipProbability}%`}
    >
      {/* Icon + description */}
      <span className="text-accent flex items-center gap-1">
        <WeatherIcon name={iconName} size={14} />
        <span className="text-ink-secondary">{description}</span>
      </span>

      {/* Temps */}
      <span className="text-ink-primary font-medium">
        {displayTemp(weather.tempMax)}
      </span>
      <span className="text-ink-muted">/ {displayTemp(weather.tempMin)}</span>

      {/* Precipitation probability */}
      {weather.precipProbability > 0 && (
        <span className="text-ink-secondary flex items-center gap-0.5">
          <CloudRain size={12} aria-hidden="true" />
          {weather.precipProbability}%
        </span>
      )}

      {isToday && (
        <span className="ml-auto text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
          Today
        </span>
      )}
    </div>
  );
}

/** Skeleton shimmer placeholder while weather is loading */
export function WeatherStripSkeleton() {
  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 rounded-xl text-xs mt-1 mb-2 bg-surface-raised border border-white/5 animate-pulse"
      data-testid="weather-strip-skeleton"
      aria-label="Loading weather forecast"
    >
      <div className="h-3 w-16 bg-white/10 rounded" />
      <div className="h-3 w-10 bg-white/10 rounded" />
      <div className="h-3 w-8 bg-white/10 rounded" />
    </div>
  );
}

/** Shown for days beyond the 16-day forecast window */
export function WeatherStripUnavailable() {
  return (
    <div
      className="px-3 py-1 text-xs text-ink-muted mt-1 mb-2"
      data-testid="weather-strip-unavailable"
    >
      Forecast unavailable
    </div>
  );
}
