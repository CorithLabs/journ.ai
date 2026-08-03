/**
 * Minimal mapbox-gl type declarations.
 * These cover the subset of the Mapbox GL JS API used in this app.
 * When the mapbox-gl npm package is installed, these will be overridden.
 */
declare module 'mapbox-gl' {
  export interface LngLatLike {
    lng: number;
    lat: number;
  }

  export type LngLatBoundsLike =
    | [[number, number], [number, number]]
    | LngLatLike[]
    | LngLatBounds;

  export class LngLatBounds {
    constructor(sw?: [number, number], ne?: [number, number]);
    extend(coord: [number, number] | LngLatLike): this;
    isEmpty(): boolean;
  }

  export interface MapOptions {
    container: HTMLElement | string;
    style: string;
    accessToken?: string;
    center?: [number, number];
    zoom?: number;
    projection?: string;
  }

  export interface FitBoundsOptions {
    padding?: number | { top: number; bottom: number; left: number; right: number };
    animate?: boolean;
    duration?: number;
    maxZoom?: number;
  }

  export interface PopupOptions {
    closeButton?: boolean;
    closeOnClick?: boolean;
    offset?: number | [number, number];
    className?: string;
    maxWidth?: string;
  }

  export class Popup {
    constructor(options?: PopupOptions);
    setLngLat(lngLat: [number, number]): this;
    setHTML(html: string): this;
    addTo(map: Map): this;
    remove(): void;
  }

  export class Marker {
    constructor(element?: HTMLElement, options?: { offset?: [number, number] });
    setLngLat(lngLat: [number, number]): this;
    addTo(map: Map): this;
    remove(): void;
    getElement(): HTMLElement;
    setPopup(popup: Popup): this;
  }

  export interface SourceSpecification {
    type: 'geojson' | 'vector' | 'raster' | 'image' | 'video';
    data?: GeoJSON.FeatureCollection | GeoJSON.Feature | string;
    url?: string;
    tiles?: string[];
    [key: string]: unknown;
  }

  export interface LayerSpecification {
    id: string;
    type: 'fill' | 'line' | 'symbol' | 'circle' | 'heatmap' | 'fill-extrusion' | 'raster' | 'hillshade' | 'background';
    source: string;
    'source-layer'?: string;
    layout?: Record<string, unknown>;
    paint?: Record<string, unknown>;
    filter?: unknown[];
    minzoom?: number;
    maxzoom?: number;
    metadata?: unknown;
  }

  export interface GeoJSONSource {
    setData(data: GeoJSON.FeatureCollection | GeoJSON.Feature | string): void;
  }

  export class Map {
    constructor(options: MapOptions);
    on(event: string, handler: (e: unknown) => void): this;
    on(event: string, layerId: string, handler: (e: unknown) => void): this;
    off(event: string, handler: (e: unknown) => void): this;
    remove(): void;
    addSource(id: string, source: SourceSpecification): this;
    addLayer(layer: LayerSpecification): this;
    removeLayer(id: string): this;
    removeSource(id: string): this;
    getSource(id: string): GeoJSONSource | undefined;
    hasImage(id: string): boolean;
    loadImage(url: string, callback: (error: Error | null, image: HTMLImageElement | ImageBitmap | null) => void): void;
    addImage(id: string, image: HTMLImageElement | ImageBitmap, options?: { pixelRatio?: number }): void;
    fitBounds(bounds: LngLatBoundsLike, options?: FitBoundsOptions): this;
    flyTo(options: { center?: [number, number]; zoom?: number; padding?: number; duration?: number }): this;
    setCenter(center: [number, number]): this;
    setZoom(zoom: number): this;
    getCanvas(): HTMLCanvasElement;
    project(lnglat: [number, number]): { x: number; y: number };
    queryRenderedFeatures(point: unknown, options?: { layers?: string[] }): MapboxGeoJSONFeature[];
    resize(): void;
  }

  export interface MapboxGeoJSONFeature extends GeoJSON.Feature {
    layer: LayerSpecification;
    source: string;
    sourceLayer?: string;
    state: Record<string, unknown>;
  }

  export const accessToken: string;

  const mapboxgl: {
    Map: typeof Map;
    Marker: typeof Marker;
    Popup: typeof Popup;
    LngLatBounds: typeof LngLatBounds;
    accessToken: string;
    supported: () => boolean;
  };

  export default mapboxgl;
}

// Extend global namespace for CDN-loaded mapbox
declare global {
  interface Window {
    mapboxgl?: {
      Map: new (options: import('mapbox-gl').MapOptions) => import('mapbox-gl').Map;
      Marker: new (element?: HTMLElement, options?: { offset?: [number, number] }) => import('mapbox-gl').Marker;
      Popup: new (options?: import('mapbox-gl').PopupOptions) => import('mapbox-gl').Popup;
      LngLatBounds: new (sw?: [number, number], ne?: [number, number]) => import('mapbox-gl').LngLatBounds;
      accessToken: string;
      supported: () => boolean;
    };
  }
}
