/**
 * Dynamically loads Mapbox GL JS from CDN (avoids needing it in package.json).
 * Returns { loaded, error } — components wait for `loaded === true` before
 * trying to access window.mapboxgl.
 */
import { useState, useEffect } from 'react';

const MAPBOX_VERSION = '2.15.0';
const SCRIPT_ID = 'mapbox-gl-script';
const LINK_ID = 'mapbox-gl-css';

let loadPromise: Promise<void> | null = null;

function loadMapbox(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    // Already loaded
    if (typeof window !== 'undefined' && (window as Window & { mapboxgl?: unknown }).mapboxgl) {
      resolve();
      return;
    }

    // Inject CSS
    if (!document.getElementById(LINK_ID)) {
      const link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      link.href = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css`;
      document.head.appendChild(link);
    }

    // Inject JS
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Mapbox GL JS'));
      document.head.appendChild(script);
    } else {
      // Script tag exists but hasn't fired onload yet — poll
      const poll = setInterval(() => {
        if ((window as Window & { mapboxgl?: unknown }).mapboxgl) {
          clearInterval(poll);
          resolve();
        }
      }, 50);
    }
  });

  return loadPromise;
}

export function useMapboxScript(): { loaded: boolean; error: string | null } {
  const [loaded, setLoaded] = useState(
    typeof window !== 'undefined' &&
      !!(window as Window & { mapboxgl?: unknown }).mapboxgl,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    loadMapbox()
      .then(() => setLoaded(true))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Mapbox load failed'),
      );
  }, [loaded]);

  return { loaded, error };
}
