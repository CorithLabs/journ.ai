import { useEffect, useRef, useCallback } from 'react';
import { type Plan } from '../../db';
import { getDayColor } from '../../constants/colors';
import { totalRouteDistanceKm, type PinActivity } from '../../services/mapbox';
import type { BBox, DiscoveredPlace } from '../../services/discover';

// Minimal types for CDN-loaded mapbox-gl (window.mapboxgl)
interface MapboxGLMap {
  on(event: string, handler: (e?: unknown) => void): this;
  on(event: string, layerId: string, handler: (e: unknown) => void): this;
  off(event: string, handler: (e?: unknown) => void): this;
  remove(): void;
  addSource(id: string, source: Record<string, unknown>): this;
  addLayer(layer: Record<string, unknown>): this;
  removeLayer(id: string): this;
  removeSource(id: string): this;
  getSource(id: string): { setData?: (data: unknown) => void } | undefined;
  hasImage(id: string): boolean;
  loadImage(url: string, callback: (error: Error | null, image: unknown) => void): void;
  addImage(id: string, image: unknown): void;
  fitBounds(bounds: MapboxLngLatBounds, options?: { padding?: number; duration?: number; maxZoom?: number }): this;
  flyTo(options: { center?: [number, number]; zoom?: number; padding?: number; duration?: number }): this;
  loaded?(): boolean;
  getBounds(): { toArray(): [[number, number], [number, number]] } | null;
}

interface MapboxLngLatBounds {
  extend(coord: [number, number]): this;
  isEmpty(): boolean;
}

interface MapboxMarker {
  setLngLat(coords: [number, number]): this;
  addTo(map: MapboxGLMap): this;
  remove(): void;
}

interface MapboxGLLib {
  Map: new (opts: {
    container: HTMLElement;
    style: string;
    center?: [number, number];
    zoom?: number;
  }) => MapboxGLMap;
  Marker: new (element?: HTMLElement) => MapboxMarker;
  LngLatBounds: new () => MapboxLngLatBounds;
  accessToken: string;
}

function getMapboxGL(): MapboxGLLib | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as unknown as { mapboxgl?: MapboxGLLib }).mapboxgl ?? null;
}

interface Props {
  plan: Plan;
  token: string;
  selectedDayIndex: number | null; // null = all days
  pins: PinActivity[];
  onDistanceChange: (km: number | null) => void;
  onPinClick: (pin: PinActivity) => void;
  /** The pin whose card is open, drawn with a ring so the link is obvious. */
  selectedActivityId?: string | null;
  /** Called when Mapbox GL emits an error. kind distinguishes an auth failure
   * (invalid/expired token → HTTP 401 from tile servers) from any other error. */
  onMapError?: (kind: 'auth' | 'other') => void;
  /**
   * Places found by a discovery filter, drawn apart from the itinerary's own.
   *
   * A different shape on purpose: these are suggestions, and one that looked
   * like a numbered stop would read as something already planned.
   */
  discovered?: DiscoveredPlace[];
  onDiscoveredClick?: (place: DiscoveredPlace) => void;
  /** The area on screen, so a search can be about what is being looked at. */
  onViewportChange?: (bbox: BBox) => void;
}

const ROUTE_SOURCE_ID = 'route-line-source';
const ROUTE_LAYER_ID = 'route-line-layer';
const ARROW_LAYER_ID = 'route-arrow-layer';

// Shape of a Mapbox GL error event — we only need the optional status code.
interface MapboxErrorEvent {
  error?: { status?: number; message?: string };
}

function isAuthError(e: unknown): boolean {
  const err = (e as MapboxErrorEvent | undefined)?.error;
  if (!err) return false;
  if (err.status === 401 || err.status === 403) return true;
  const msg = err.message?.toLowerCase() ?? '';
  return msg.includes('401') || msg.includes('unauthorized') || msg.includes('access token');
}

function createPinElement(
  sequenceNumber: number,
  color: string,
  label: string,
): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: ${color};
    border: 2px solid rgba(255,255,255,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    transition: transform 0.15s ease;
  `;
  el.textContent = String(sequenceNumber);
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `Pin ${sequenceNumber}: ${label}`);
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

/**
 * How far apart to nudge pins that landed on the same point, in metres.
 *
 * Small enough to still read as "here", large enough to separate two 28px
 * circles at the zoom a day's stops are viewed at.
 */
const SPREAD_METRES = 35;

/**
 * Where each pin is actually drawn, with co-located ones fanned out.
 *
 * Activities in the same vague place — two things in Shibuya, three stops with
 * only a neighbourhood for a location — geocode to exactly the same point, and
 * Mapbox stacks the markers. The ones underneath are invisible and cannot be
 * tapped, so a day of five cards showed three pins and looked like it had lost
 * two. Nothing was lost; they were hidden.
 *
 * Nudging is honest here because the positions were interchangeable already:
 * they are one lookup result repeated, not two places that were measured.
 */
/**
 * A found place, drawn so it cannot be mistaken for a planned one.
 *
 * Smaller, hollow and unnumbered. The itinerary's pins are solid circles
 * carrying the position of a card; one of these carrying a number would read
 * as something already decided.
 */
function createDiscoveredElement(label: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: rgba(15,23,42,0.85);
    border: 2px solid #34d399;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.5);
    transition: transform 0.15s ease;
  `;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `${label} — add to your trip`);
  el.dataset.testid = 'discovered-pin';
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.3)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

export function spreadCoincident(pins: PinActivity[]): Array<[number, number]> {
  const groups = new Map<string, number[]>();
  pins.forEach((pin, i) => {
    const [lng, lat] = pin.activity.coordinates!;
    // Rounded, because the same place looked up twice can differ in the last
    // decimal — still the same point on any screen.
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });

  const placed: Array<[number, number]> = pins.map((p) => p.activity.coordinates!);
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.forEach((pinIndex, k) => {
      const [lng, lat] = pins[pinIndex].activity.coordinates!;
      const angle = (2 * Math.PI * k) / members.length;
      const dLat = (SPREAD_METRES * Math.sin(angle)) / 111320;
      const dLng =
        (SPREAD_METRES * Math.cos(angle)) /
        (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
      placed[pinIndex] = [lng + dLng, lat + dLat];
    });
  }
  return placed;
}

export default function MapboxMap({
  plan,
  token,
  selectedDayIndex,
  pins,
  onDistanceChange,
  onPinClick,
  selectedActivityId,
  onMapError,
  discovered,
  onDiscoveredClick,
  onViewportChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxGLMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const pinElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const onMapErrorRef = useRef(onMapError);
  onMapErrorRef.current = onMapError;
  // Kept in refs so the map is built once: these change on every render of the
  // tab above, and rebuilding the map would throw the camera away with it.
  const discoveredMarkersRef = useRef<MapboxMarker[]>([]);
  const onDiscoveredClickRef = useRef(onDiscoveredClick);
  onDiscoveredClickRef.current = onDiscoveredClick;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  // Remove all existing markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    pinElementsRef.current.clear();
  }, []);

  // Remove route layers and source
  const clearRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getSource(ROUTE_SOURCE_ID)) {
        try { map.removeLayer(ROUTE_LAYER_ID); } catch { /* already removed */ }
        try { map.removeLayer(ARROW_LAYER_ID); } catch { /* already removed */ }
        map.removeSource(ROUTE_SOURCE_ID);
      }
    } catch { /* ignore */ }
  }, []);

  const drawRouteForDay = useCallback((dayPins: PinActivity[], dayIndex: number) => {
    const map = mapRef.current;
    const mapboxgl = getMapboxGL();
    if (!map || !mapboxgl) return;

    clearRoute();

    if (dayPins.length < 2) {
      onDistanceChange(null);
      return;
    }

    const coords = dayPins.map(p => p.activity.coordinates as [number, number]);
    const color = getDayColor(dayIndex);
    const distKm = totalRouteDistanceKm(coords);
    onDistanceChange(distKm);

    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
        properties: {},
      },
    });

    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': color,
        'line-width': 3,
        'line-opacity': 0.8,
      },
    });

    map.addLayer({
      id: ARROW_LAYER_ID,
      type: 'symbol',
      source: ROUTE_SOURCE_ID,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 80,
        'icon-image': 'arrow',
        'icon-size': 0.6,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
      },
      paint: {
        'icon-color': color,
        'icon-opacity': 0.8,
      },
    });
  }, [clearRoute, onDistanceChange]);

  const renderPins = useCallback((pinsToRender: PinActivity[]) => {
    const map = mapRef.current;
    const mapboxgl = getMapboxGL();
    if (!map || !mapboxgl) return;

    clearMarkers();

    if (pinsToRender.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    const placed = spreadCoincident(pinsToRender);

    pinsToRender.forEach((pin, pinIndex) => {
      const coords = placed[pinIndex];
      const el = createPinElement(pin.sequenceNumber, pin.dayColor, pin.activity.name);

      const marker = new mapboxgl.Marker(el)
        .setLngLat(coords)
        .addTo(map);

      /*
       * The pin opens the real activity card, not a popup built from raw HTML.
       *
       * The popup that used to live here could never open: Mapbox toggles a
       * marker popup from a click handler on the MAP, reached by the event
       * bubbling up from the marker element — and the stopPropagation below
       * cut that bubble before it arrived. It also has to stay: without it a
       * pin tap reaches the map underneath and closes the card again.
       */
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPinClick(pin);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPinClick(pin);
        }
      });
      pinElementsRef.current.set(pin.activity.id, el);

      markersRef.current.push(marker);
      bounds.extend(coords);
    });

    if (!bounds.isEmpty() && pinsToRender.length > 0) {
      if (pinsToRender.length === 1) {
        map.flyTo({ center: placed[0], zoom: 14 });
      } else {
        map.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 16 });
      }
    }
  }, [clearMarkers, onPinClick]);

  /*
   * Kept in their own marker list so a change of filter does not disturb the
   * itinerary pins — and, more to the point, does not refit the camera and
   * move the map out from under someone who is browsing.
   */
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = getMapboxGL();
    if (!map || !mapboxgl) return;

    discoveredMarkersRef.current.forEach((m) => m.remove());
    discoveredMarkersRef.current = [];

    for (const place of discovered ?? []) {
      const el = createDiscoveredElement(place.name);
      const open = (e: Event) => {
        // Or the map underneath takes the tap and closes what just opened.
        e.stopPropagation();
        onDiscoveredClickRef.current?.(place);
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          open(e);
        }
      });
      discoveredMarkersRef.current.push(new mapboxgl.Marker(el).setLngLat(place.coordinates).addTo(map));
    }

    return () => {
      discoveredMarkersRef.current.forEach((m) => m.remove());
      discoveredMarkersRef.current = [];
    };
  }, [discovered]);

  /*
   * Applied straight to the element rather than by re-rendering the markers:
   * re-rendering refits the camera, so the map would jump every time a card
   * was opened.
   */
  useEffect(() => {
    for (const [id, el] of pinElementsRef.current) {
      const on = id === selectedActivityId;
      el.style.boxShadow = on
        ? '0 0 0 4px rgba(255,255,255,0.85), 0 2px 8px rgba(0,0,0,0.4)'
        : '0 2px 8px rgba(0,0,0,0.4)';
      el.style.zIndex = on ? '1' : '';
    }
  }, [selectedActivityId, pins]);

  // Initialise the map once
  useEffect(() => {
    const mapboxgl = getMapboxGL();
    if (!mapboxgl || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [0, 20],
      zoom: 1.5,
    });

    mapRef.current = map;

    // Surface Mapbox errors (e.g. HTTP 401 from an invalid/expired token) so the
    // MapTab can show an actionable message instead of a broken map.
    const handleError = (e?: unknown) => {
      onMapErrorRef.current?.(isAuthError(e) ? 'auth' : 'other');
    };
    map.on('error', handleError);

    /*
     * What is on screen, so a discovery search can be about the area being
     * looked at rather than about the whole trip. Reported after the move
     * settles, not during it.
     */
    const reportViewport = () => {
      const bounds = map.getBounds?.()?.toArray();
      if (!bounds) return;
      const [[w, s2], [e, n]] = bounds;
      onViewportChangeRef.current?.([w, s2, e, n]);
    };
    map.on('moveend', reportViewport);

    map.on('load', () => {
      reportViewport();
      // Load arrow image for route direction
      map.loadImage(
        'https://docs.mapbox.com/mapbox-gl-js/assets/arrow.png',
        (error: Error | null, image: unknown) => {
          if (!error && image && !map.hasImage('arrow')) {
            map.addImage('arrow', image);
          }
        },
      );
    });

    return () => {
      map.off('error', handleError);
      map.off('moveend', reportViewport);
      clearMarkers();
      clearRoute();
      map.remove();
      mapRef.current = null;
    };
  }, [token, clearMarkers, clearRoute]);

  // Update pins & route when selectedDayIndex or pins change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      if (selectedDayIndex === null) {
        // All days — show all pins, no route
        clearRoute();
        onDistanceChange(null);
        renderPins(pins);
      } else {
        // Specific day
        const dayPins = pins.filter(p => p.dayIndex === selectedDayIndex);
        clearRoute();
        renderPins(dayPins);
        if (dayPins.length >= 2) {
          const drawOnIdle = () => {
            drawRouteForDay(dayPins, selectedDayIndex);
            map.off('idle', drawOnIdle);
          };
          map.on('idle', drawOnIdle);
        } else {
          onDistanceChange(null);
        }
      }
    };

    if (map.loaded?.()) {
      update();
    } else {
      const onLoad = () => { update(); map.off('load', onLoad); };
      map.on('load', onLoad);
    }
  }, [selectedDayIndex, pins, renderPins, clearRoute, drawRouteForDay, onDistanceChange]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      data-testid="mapbox-container"
      aria-label={`Map showing itinerary for ${plan.destination}`}
    />
  );
}
