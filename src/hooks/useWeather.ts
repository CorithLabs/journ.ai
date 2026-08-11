import { useEffect } from 'react';
import { type Plan } from '../db';
import { useAppStore } from '../store';
import { fetchWeatherByCity } from '../services/weather';
import { cityForDay } from '../utils/dayCity';
import { dateForDayIndex } from '../utils/tripDay';

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
      /*
       * Which city each day is in, decided from the plan rather than assumed
       * to be the destination — a Tokyo forecast is no use on the day spent
       * in Osaka.
       */
      const cityForDate: Record<string, string> = {};
      for (const day of plan.itinerary) {
        const date = dateForDayIndex(plan.startDate, day.dayIndex);
        if (date) cityForDate[date] = cityForDay(plan, day);
      }
      // A plan with no days yet still has a destination worth forecasting.
      if (!Object.keys(cityForDate).length) {
        const date = dateForDayIndex(plan.startDate, 0);
        if (date) cityForDate[date] = plan.destination;
      }

      const weather = await fetchWeatherByCity(
        cityForDate,
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
  }, [plan?.id, plan?.destination, plan?.startDate, plan?.endDate, plan?.itinerary, setWeather]);
}
