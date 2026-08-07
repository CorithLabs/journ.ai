import { describe, it, expect } from 'vitest';
import { TYPE_BORDER } from '../../clipboard/clipboardConstants';

/**
 * Tailwind's `border-{color}` sets border-color on ALL four sides. These cards
 * previously had no border except `border-l-2`, so only the left rail showed.
 * Once card-surface added `border border-white/10`, the category class started
 * overriding the colour on every side and outlined the whole card — verified
 * on the deployed build, where all four borders computed to the category hue.
 * The per-side utility scopes it back to the rail.
 */
describe('category colour is a left rail, not an outline', () => {
  it('every clipboard type uses a left-only border utility', () => {
    for (const [type, cls] of Object.entries(TYPE_BORDER)) {
      expect(cls, `${type} must not colour all four borders`).toMatch(/^border-l-/);
    }
  });
});
