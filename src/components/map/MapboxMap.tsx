import { useEffect, useRef, useCallback } from 'react';
import { type Plan } from '../../db';
import { getDayColor } from '../../constants/colors';
import { totalRouteDistanceKm, type PinActivity } from '../../services/mapbox';

// Minimal types for CDN-loaded mapbox-gl (window.mapboxgl)
interface MapboxGLMap {
  on(event: string, handler: () => void): this;
  on(event: string, layerId: string, handler: (e: unknown) => void): this;
  off(event: string, handler: () => void): this;
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
}

interface MapboxLngLatBounds {
  extend(coord: [number, number]): this;
  isEmpty(): boolean;
}

interface MapboxMarker {
  setLngLat(coords: [number, number]): this;
  setPopup(popup: MapboxPopup): this;
  addTo(map: MapboxGLMap): this;
  remove(): void;
}

interface MapboxPopup {
  setHTML(html: string): this;
}

interface MapboxGLLib {
  Map: new (opts: {
    container: HTMLElement;
    style: string;
    center?: [number, number];
    zoom?: number;
  }) => MapboxGLMap;
  Marker: new (element?: HTMLElement) => MapboxMarker;
  Popup: new (opts?: { closeButton?: boolean; closeOnClick?: boolean; offset?: number; maxWidth?: string }) => MapboxPopup;
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
}

const ROUTE_SOURCE_ID = 'route-line-source';
const ROUTE_LAYER_ID = 'route-line-layer';
const ARROW_LAYER_ID = 'route-arrow-layer';

function createPinElement(
  sequenceNumber: number,
  color: string,
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
  el.setAttribute('aria-label', `Pin ${sequenceNumber}`);
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

export default function MapboxMap({
  plan,
  token,
  selectedDayIndex,
  pins,
  onDistanceChange,
  onPinClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxGLMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);

  // Remove all existing markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
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

    for (const pin of pinsToRender) {
      const coords = pin.activity.coordinates!;
      const el = createPinElement(pin.sequenceNumber, pin.dayColor);

      const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: 16, maxWidth: '220px' })
        .setHTML(`
          <div style="font-family: system-ui; color: #f1f5f9; background: #1a2235; padding: 8px; border-radius: 8px; min-width: 160px;">
            <div style="font-size: 12px; color: #94a3b8; margin-bottom: 2px;">${pin.dayLabel}</div>
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${pin.activity.name}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">${pin.activity.time} · ${pin.activity.locationName}</div>
            ${pin.activity.notes ? `<div style="font-size: 11px; color: #94a3b8;">${pin.activity.notes}</div>` : ''}
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPinClick(pin);
      });

      markersRef.current.push(marker);
      bounds.extend(coords);
    }

    if (!bounds.isEmpty() && pinsToRender.length > 0) {
      if (pinsToRender.length === 1) {
        map.flyTo({ center: pinsToRender[0].activity.coordinates!, zoom: 14 });
      } else {
        map.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 16 });
      }
    }
  }, [clearMarkers, onPinClick]);

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

    map.on('load', () => {
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
