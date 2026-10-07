import { CloudLightning, CloudRain, CloudSnow, Wind, type LucideIcon } from 'lucide-react';
import type { WeatherHazard } from '../../utils/weatherUtils';

/**
 * How each hazard looks, wherever it is shown: on the trip photo, the day's
 * band, its button in the day bar, and the outdoor stops it spoils. One table,
 * so a wet day is the same blue in all four.
 *
 * Class names are written out in full for Tailwind to find.
 */
export const HAZARD: Record<WeatherHazard, {
  Icon: LucideIcon;
  /** Headline, as on the photo and the band. */
  title: string;
  /** One word, for the forecast tiles. */
  short: string;
  /** The tag on an outdoor stop. */
  stop: string;
  text: string;
  border: string;
  tint: string;
}> = {
  storm: {
    Icon: CloudLightning,
    title: 'Thunderstorms',
    short: 'Storms',
    stop: 'Outdoors · storms',
    text: 'text-weather-storm',
    border: 'border-weather-storm/50',
    tint: 'bg-weather-storm/15',
  },
  snow: {
    Icon: CloudSnow,
    title: 'Snow expected',
    short: 'Snow',
    stop: 'Outdoors · snow',
    text: 'text-weather-snow',
    border: 'border-weather-snow/50',
    tint: 'bg-weather-snow/15',
  },
  rain: {
    Icon: CloudRain,
    title: 'Rain likely',
    short: 'Rain',
    stop: 'Outdoors · may be wet',
    text: 'text-weather-rain',
    border: 'border-weather-rain/50',
    tint: 'bg-weather-rain/15',
  },
  wind: {
    Icon: Wind,
    title: 'High winds',
    short: 'Wind',
    stop: 'Exposed · windy',
    text: 'text-weather-wind',
    border: 'border-weather-wind/50',
    tint: 'bg-weather-wind/15',
  },
};
