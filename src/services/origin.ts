import { lookupCity, type City } from './cityLookup';

/*
 * Where the traveller is starting from, suggested rather than asked.
 *
 * Two ways, the first silent and the second only on request:
 *   - the device's time zone, which names a city ("America/Toronto") and is
 *     there without any permission prompt — often the right city and always
 *     the right region;
 *   - the device's location, when "Use my location" is tapped. A permission
 *     prompt on opening the app is mostly refused, and this is a convenience.
 */

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". Null for UTC and the like. */
export function cityFromTimeZone(tz: string | undefined | null): string | null {
  if (!tz || !tz.includes('/') || /^(Etc|SystemV|US|Canada)\//.test(tz)) return null;
  const name = tz.split('/').pop()!.replace(/_/g, ' ').trim();
  return name.length >= 2 ? name : null;
}

export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** The city the time zone names, looked up so it has a place on the map. */
export async function guessOrigin(): Promise<City | null> {
  const name = cityFromTimeZone(deviceTimeZone());
  return name ? lookupCity(name) : null;
}

const REVERSE_URL = 'https://photon.komoot.io/reverse';

interface ReverseFeature {
  properties?: { city?: string; name?: string; county?: string; state?: string; country?: string; countrycode?: string };
}

export class LocationError extends Error {}

/**
 * The nearest city to where the device is. Asks the browser for the position
 * (which shows its own prompt), then OpenStreetMap's Photon for the city at
 * that point; nothing else is sent anywhere.
 */
export async function locateOrigin(): Promise<City> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new LocationError('This browser cannot share a location.');
  }
  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 10 * 60_000, timeout: 15_000 }),
  ).catch((e: GeolocationPositionError) => {
    throw new LocationError(e?.code === 1 ? 'Location is turned off for this site.' : 'Could not find your location.');
  });

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  try {
    const resp = await fetch(`${REVERSE_URL}?lat=${lat}&lon=${lon}&lang=en&limit=1`);
    if (resp.ok) {
      const data = (await resp.json()) as { features?: ReverseFeature[] };
      const p = data.features?.[0]?.properties;
      const name = p?.city || p?.county || p?.name;
      if (name) {
        const label = [name, p?.state !== name ? p?.state : null, p?.country].filter(Boolean).join(', ');
        return {
          name,
          region: p?.state ?? null,
          country: p?.country ?? null,
          countryCode: p?.countrycode?.toUpperCase() ?? null,
          coordinates: [lon, lat],
          label,
        };
      }
    }
  } catch {
    // Fall through: the position alone is still worth having.
  }
  throw new LocationError('Found your location, but not the city it is in.');
}
