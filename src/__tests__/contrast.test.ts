import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The palette has to stay legible.
 *
 * ink-muted once measured 2.53 : 1 on the base surface and 2.09 on an overlay
 * — under the 3:1 floor for a UI component, never mind the 4.5 body text needs
 * — while carrying over a hundred labels across the app. Nothing caught it,
 * because a colour that is merely hard to read looks fine in a screenshot and
 * fails only for the people who cannot read it.
 *
 * These read the real stylesheet rather than a copy of the values, so a token
 * edited in index.css is measured here or the numbers mean nothing.
 */

const CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf-8');

function token(name: string): string {
  const found = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  if (!found) throw new Error(`--color-${name} is not defined in index.css`);
  return found[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every ground text is drawn on. The overlay is the palest, so it is the test. */
const SURFACES = ['surface-base', 'surface-raised', 'surface-overlay'] as const;

const AA_TEXT = 4.5;
const AA_UI = 3; // icons, borders, and anything that has to read as a control

describe('text is readable on every surface', () => {
  // Each tier has to clear AA, and the three have to stay distinguishable —
  // fixing contrast by dragging them together would cost the hierarchy.
  it.each(['ink-primary', 'ink-secondary', 'ink-muted'])('%s clears AA', (ink) => {
    for (const surface of SURFACES) {
      expect(contrast(token(ink), token(surface))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('keeps the three ink tiers visibly apart', () => {
    const [primary, secondary, muted] = ['ink-primary', 'ink-secondary', 'ink-muted']
      .map((t) => contrast(token(t), token('surface-base')));
    expect(primary).toBeGreaterThan(secondary * 1.5);
    expect(secondary).toBeGreaterThan(muted * 1.2);
  });

  it.each(['status-success', 'status-warning', 'status-danger', 'accent'])(
    '%s clears AA as text',
    (status) => {
      for (const surface of SURFACES) {
        expect(contrast(token(status), token(surface))).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );
});

describe('controls are visible as controls', () => {
  it.each(['accent-muted', 'accent-light', 'accent-sky'])('%s clears the UI floor', (tone) => {
    for (const surface of SURFACES) {
      expect(contrast(token(tone), token(surface))).toBeGreaterThanOrEqual(AA_UI);
    }
  });

  /*
   * A label on a solid danger fill managed 3.44 against ink-primary. Solid
   * status fills take the inverse ink, the way the accent button does.
   */
  it('labels a solid danger fill in the ink that can be read on it', () => {
    expect(contrast(token('ink-inverse'), token('status-danger'))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(token('ink-primary'), token('status-danger'))).toBeLessThan(AA_TEXT);
  });

  it('labels a solid warning fill the same way', () => {
    expect(contrast(token('ink-inverse'), token('status-warning'))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
