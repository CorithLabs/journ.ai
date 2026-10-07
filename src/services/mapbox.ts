/**
 * The Mapbox token, for the map view only.
 *
 * Place and city lookups no longer use Mapbox (see places.ts and
 * cityLookup.ts); this stays only until the map itself stops needing it.
 */

/** localStorage key for the Mapbox access token */
export const MAPBOX_TOKEN_KEY = 'aitp_mapbox_token';

export function getMapboxToken(): string | null {
  return localStorage.getItem(MAPBOX_TOKEN_KEY);
}
