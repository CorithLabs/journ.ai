import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { STYLE_URL, paperStyle, type MapStyle } from './paperStyle';
import type { LngLat } from './paperGeometry';

/** Where things are on screen, for the pins drawn over the map. */
export interface BaseView {
  xy: (at: LngLat) => [number, number];
  ll: (x: number, y: number) => LngLat;
  pxPerKm: number;
  /** [west, south, east, north] of what is showing. */
  bounds: [number, number, number, number];
}

interface Props {
  /** [[west, south], [east, north]] to frame. */
  frame: [LngLat, LngLat];
  padding: { top: number; bottom: number; left: number; right: number };
  /** Changes when the framing should be redone — a different day shown. */
  frameKey: string;
  /** Bumped to put the camera back on the trip after panning away. */
  recentre: number;
  onView: (view: BaseView) => void;
  /** No WebGL, no network, or the style would not load: draw the plain sheet. */
  onUnavailable: () => void;
}

let styleCache: Promise<MapStyle> | null = null;
function loadStyle(): Promise<MapStyle> {
  styleCache ??= fetch(STYLE_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`style ${r.status}`);
      return r.json() as Promise<MapStyle>;
    })
    .then(paperStyle)
    .catch((e) => {
      styleCache = null; // try again next time
      throw e;
    });
  return styleCache;
}

/** Whether a street map can be drawn here at all. */
export function canDrawStreets(): boolean {
  if (typeof window === 'undefined' || !navigator.onLine) return false;
  if (typeof window.WebGLRenderingContext === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The city under the sheet: real streets, water and parks from OpenStreetMap,
 * in the sheet's own colours. Pan and pinch to explore; the pins and routes
 * are drawn over it by PaperMap and follow it.
 *
 * MapLibre is loaded only when this mounts, so nobody downloads a map
 * renderer for a trip they never open the map of.
 */
export default function PaperBaseMap({ frame, padding, frameKey, recentre, onView, onUnavailable }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const latest = useRef({ frame, padding, onView, onUnavailable });
  latest.current = { frame, padding, onView, onUnavailable };

  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    (async () => {
      try {
        const [{ default: maplibregl }, style] = await Promise.all([
          import('maplibre-gl'),
          loadStyle(),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        if (cancelled || !el.current) return;

        const map = new maplibregl.Map({
          container: el.current,
          style: style as unknown as maplibregl.StyleSpecification,
          bounds: latest.current.frame,
          fitBoundsOptions: { padding: latest.current.padding, maxZoom: 16 },
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxZoom: 18,
        });
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;

        /*
         * The sheet can still be settling its size when the map is made, and
         * a frame fitted to the wrong size is a city zoomed out to a smudge.
         * Fit again once it knows its size — until the traveller has moved
         * the map themselves, after which where they put it is theirs.
         */
        let touched = false;
        map.on('dragstart', () => { touched = true; });
        map.on('zoomstart', (e) => { if ((e as { originalEvent?: unknown }).originalEvent) touched = true; });
        const settle = () => {
          if (!touched) map.fitBounds(latest.current.frame, { padding: latest.current.padding, maxZoom: 16, duration: 0 });
        };
        map.once('load', settle);
        map.on('resize', settle);

        const report = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const b = map.getBounds();
            const c = map.getCenter();
            const a = map.project([c.lng, c.lat]);
            // One kilometre east of the centre, on screen.
            const east = map.project([c.lng + 1 / (111.32 * Math.cos((c.lat * Math.PI) / 180)), c.lat]);
            latest.current.onView({
              xy: (at) => {
                const p = map.project(at);
                return [p.x, p.y];
              },
              ll: (x, y) => {
                const p = map.unproject([x, y]);
                return [p.lng, p.lat];
              },
              pxPerKm: Math.abs(east.x - a.x),
              bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
            });
          });
        };
        // The camera is known the moment the map exists; there is no need to
        // wait for every tile before putting the pins on it.
        report();
        map.on('move', report);
        map.on('resize', report);
        map.on('load', report);
        map.on('error', () => {
          // A tile here and there is not worth giving up the map for; the
          // style itself failing is.
          if (!map.isStyleLoaded() && !map.loaded()) latest.current.onUnavailable();
        });
      } catch {
        if (!cancelled) latest.current.onUnavailable();
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // A different day, or the recentre button: frame the stops again.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(latest.current.frame, { padding: latest.current.padding, maxZoom: 16, duration: 600 });
  }, [frameKey, recentre]);

  // Wrapped, because MapLibre's own stylesheet makes its container
  // position: relative, which would undo filling the sheet.
  return (
    <div className="absolute inset-0" data-testid="paper-base-map">
      <div ref={el} className="w-full h-full" />
    </div>
  );
}
