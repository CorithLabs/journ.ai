import { describe, it, expect } from 'vitest';
import { suggestModes, needsTicket, continentOf } from '../travelSuggest';

const at = (lng: number, lat: number, countryCode: string) => ({ coordinates: [lng, lat] as [number, number], countryCode });
const TORONTO = at(-79.38, 43.65, 'CA');
const MONTREAL = at(-73.57, 45.5, 'CA');
const OTTAWA = at(-75.7, 45.42, 'CA');
const VANCOUVER = at(-123.12, 49.28, 'CA');
const TOKYO = at(139.69, 35.69, 'JP');
const OSAKA = at(135.5, 34.69, 'JP');
const PARIS = at(2.35, 48.86, 'FR');
const BARCELONA = at(2.17, 41.39, 'ES');
const NYC = at(-74.0, 40.71, 'US');

/*
 * From distance and geography alone; the traveller picks. "Train" means the
 * distance suits one, since nothing free says whether a line runs.
 */
describe('suggesting how to travel', () => {
  it('offers the road and rail first for a short trip', () => {
    expect(suggestModes(MONTREAL, OTTAWA)).toEqual(['car', 'train', 'bus']);
  });

  it('puts the train first at a middle distance, with flying as an option', () => {
    expect(suggestModes(TORONTO, MONTREAL)).toEqual(['train', 'car', 'flight']);
    expect(suggestModes(TORONTO, NYC)).toEqual(['train', 'car', 'flight']);
  });

  it('puts flying first further on, the train still possible', () => {
    expect(suggestModes(PARIS, BARCELONA)).toEqual(['flight', 'train', 'car']);
  });

  it('offers only flying across a continent', () => {
    expect(suggestModes(TORONTO, VANCOUVER)).toEqual(['flight']);
  });

  it('offers only flying across an ocean', () => {
    expect(suggestModes(TORONTO, TOKYO)).toEqual(['flight']);
  });

  // Inside one island country the train and car are real.
  it('treats travel within an island country as overland', () => {
    expect(suggestModes(TOKYO, OSAKA)).toContain('train');
  });

  it('suggests nothing until both places are known', () => {
    expect(suggestModes({}, TOKYO)).toEqual([]);
  });

  it('knows which modes mean a ticket', () => {
    expect(['flight', 'train', 'bus', 'ferry'].every((m) => needsTicket(m as never))).toBe(true);
    expect(needsTicket('car')).toBe(false);
    expect(continentOf('jp')).toBe('AS');
  });
});
