/**
 * OpenFreeMap's "Positron" style, recoloured as the paper sheet.
 *
 * Positron is already quiet — grey roads, pale land, few colours — which is
 * what a base under numbered pins should be. Its greys become cream, its
 * whites the lighter paper, its blacks the sheet's brown ink, so the streets
 * read as printed on the same paper as the frame, the compass and the title.
 *
 * Free, keyless, and fine for commercial use: OpenFreeMap asks only for the
 * OpenStreetMap attribution, which the map shows.
 */

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export const PAPER = {
  land: '#f3ead5',
  landLight: '#f8f1e1',
  residential: '#efe5cc',
  park: '#e2e2c2',
  wood: '#dadbb8',
  water: '#c5d2cd',
  waterway: '#b3c4bf',
  building: '#e7dbbf',
  buildingEdge: '#d9c9a6',
  casing: '#d6c4a0',
  road: '#fbf6ea',
  minor: '#eadcbd',
  path: '#e0d1ad',
  rail: '#bfa983',
  boundary: '#b8a17a',
  ink: '#5b4a2e',
  inkSoft: '#7a6848',
  waterInk: '#4f6b70',
  halo: 'rgba(243,234,213,0.9)',
} as const;

interface Layer {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

export interface MapStyle {
  layers: Layer[];
  [key: string]: unknown;
}

/** The colour each layer takes, by what it draws. */
function colourFor(layer: Layer): Record<string, unknown> {
  const { id, type } = layer;
  if (type === 'background') return { 'background-color': PAPER.land };

  if (type === 'symbol') {
    const water = id.startsWith('water');
    const road = id.startsWith('highway-name');
    return {
      'text-color': water ? PAPER.waterInk : road ? PAPER.inkSoft : PAPER.ink,
      'text-halo-color': PAPER.halo,
      'text-halo-width': 1.4,
    };
  }

  if (type === 'fill') {
    if (id === 'water') return { 'fill-color': PAPER.water };
    if (id === 'park') return { 'fill-color': PAPER.park };
    if (id.startsWith('landcover_wood')) return { 'fill-color': PAPER.wood };
    if (id.startsWith('landcover_')) return { 'fill-color': PAPER.landLight };
    if (id.startsWith('landuse')) return { 'fill-color': PAPER.residential };
    if (id === 'building') return { 'fill-color': PAPER.building, 'fill-outline-color': PAPER.buildingEdge };
    if (id.startsWith('aeroway')) return { 'fill-color': PAPER.landLight };
    return { 'fill-color': PAPER.land };
  }

  if (type === 'line') {
    if (id === 'waterway') return { 'line-color': PAPER.waterway };
    if (id.startsWith('boundary')) return { 'line-color': PAPER.boundary };
    if (id.includes('dashline')) return { 'line-color': PAPER.land };
    if (id.startsWith('railway')) return { 'line-color': PAPER.rail };
    if (id.includes('casing')) return { 'line-color': PAPER.casing };
    if (id.includes('subtle')) return { 'line-color': PAPER.casing };
    if (id === 'highway_path') return { 'line-color': PAPER.path };
    if (id === 'highway_minor') return { 'line-color': PAPER.minor };
    if (id.startsWith('aeroway')) return { 'line-color': PAPER.landLight };
    if (id.startsWith('road_pier')) return { 'line-color': PAPER.land };
    return { 'line-color': PAPER.road };
  }

  return {};
}

/**
 * The style with every colour replaced. Widths, zooms and label text are left
 * exactly as OpenFreeMap has them; only the palette changes.
 */
export function paperStyle(style: MapStyle): MapStyle {
  return {
    ...style,
    layers: style.layers
      // Shaded relief is a raster from another source, and reads as dirt on paper.
      .filter((l) => l.type !== 'raster' && l.type !== 'hillshade')
      .map((l) => ({ ...l, paint: { ...(l.paint ?? {}), ...colourFor(l) } })),
  };
}
