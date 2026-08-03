import { useEffect } from 'react';
import { type Plan } from '../db';
import { useAppStore } from '../store';
import { fetchWeatherForPlan } from '../services/weather';

/** The localStorage key for the Mapbox token */
const MAPBOX_TOKEN_KEY = 'aitp_mapbox_token';

export function getMapboxToken(): string | null {
  return localStorage.getItem(MAPBOX_TOKEN_KEY);
}

/**
 * Fetches weather data for the given plan on mount and stores it in Zustand
 * session state. Re-fetches whenever the planId changes.
 *
 * - Silently skips fetch if offline, token missing, or geocoding fails.
 * - Weather data is never persisted to IndexedDB.
 */
export function useWeather(plan: Plan | null | undefined): void {
  const setWeather = useAppStore((s) => s.setWeather);

  useEffect(() => {
    if (!plan || !navigator.onLine) return;

    let cancelled = false;

    const run = async () => {
      const token = getMapboxToken();
      const weather = await fetchWeatherForPlan(
        plan.destination,
        plan.startDate,
        plan.endDate,
        token,
      );
      if (!cancelled && weather) {
        setWeather(weather);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [plan?.id, plan?.destination, plan?.startDate, plan?.endDate, setWeather]);
}
