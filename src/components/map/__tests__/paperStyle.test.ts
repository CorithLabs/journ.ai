import { describe, it, expect } from 'vitest';
import { paperStyle, PAPER, STYLE_URL, type MapStyle } from '../paperStyle';

const positron: MapStyle = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': 'rgb(242,243,240)' } },
    { id: 'ne2_shaded', type: 'raster', paint: {} },
    { id: 'water', type: 'fill', paint: { 'fill-color': 'rgb(194,200,202)', 'fill-antialias': true } },
    { id: 'park', type: 'fill', paint: { 'fill-color': 'rgb(230,233,229)' } },
    { id: 'highway_major_casing', type: 'line', paint: { 'line-color': 'rgb(213,213,213)', 'line-width': 3 } },
    { id: 'highway_major_inner', type: 'line', paint: { 'line-color': '#fff', 'line-width': 2 } },
    { id: 'railway_dashline', type: 'line', paint: { 'line-color': '#fafafa', 'line-dasharray': [3, 3] } },
    { id: 'label_city', type: 'symbol', layout: { 'text-field': '{name}' }, paint: { 'text-color': '#000' } },
    { id: 'water_name_point_label', type: 'symbol', paint: { 'text-color': '#495e91' } },
  ],
};

const layer = (id: string) => paperStyle(positron).layers.find((l) => l.id === id)!;

describe('the street map in paper colours', () => {
  it('uses OpenFreeMap, which needs no key', () => {
    expect(STYLE_URL).toMatch(/^https:\/\/tiles\.openfreemap\.org\//);
    expect(STYLE_URL).not.toMatch(/key|token/i);
  });

  it('prints the land on the same paper as the sheet', () => {
    expect(layer('background').paint!['background-color']).toBe(PAPER.land);
  });

  it('colours water, parks and roads from the paper palette', () => {
    expect(layer('water').paint!['fill-color']).toBe(PAPER.water);
    expect(layer('park').paint!['fill-color']).toBe(PAPER.park);
    expect(layer('highway_major_casing').paint!['line-color']).toBe(PAPER.casing);
    expect(layer('highway_major_inner').paint!['line-color']).toBe(PAPER.road);
    expect(layer('railway_dashline').paint!['line-color']).toBe(PAPER.land);
  });

  it('writes names in the sheet ink, water in its own', () => {
    expect(layer('label_city').paint!['text-color']).toBe(PAPER.ink);
    expect(layer('water_name_point_label').paint!['text-color']).toBe(PAPER.waterInk);
  });

  // Only the palette changes.
  it('keeps widths, dashes and label text as they were', () => {
    expect(layer('highway_major_casing').paint!['line-width']).toBe(3);
    expect(layer('railway_dashline').paint!['line-dasharray']).toEqual([3, 3]);
    expect(layer('label_city').layout).toEqual({ 'text-field': '{name}' });
    expect(layer('water').paint!['fill-antialias']).toBe(true);
  });

  // Shaded relief reads as dirt on paper.
  it('leaves out the shaded relief', () => {
    expect(paperStyle(positron).layers.some((l) => l.id === 'ne2_shaded')).toBe(false);
  });
});
