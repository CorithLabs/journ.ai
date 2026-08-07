import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clampToViewport, isDraggableViewport } from '../useDraggablePanel';

const setViewport = (width: number, height: number) => {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
};

beforeEach(() => setViewport(1280, 800));
afterEach(() => vi.unstubAllGlobals());

describe('clampToViewport', () => {
  const panel = { width: 380, height: 560 };

  it('leaves a position that is already fully on screen alone', () => {
    expect(clampToViewport({ x: 400, y: 200 }, panel)).toEqual({ x: 400, y: 200 });
  });

  // The panel must never end up somewhere the user cannot grab it back from.
  it('pulls a panel dragged off the right edge back into view', () => {
    const { x } = clampToViewport({ x: 5000, y: 100 }, panel);
    expect(x).toBe(1280 - 380 - 8);
  });

  it('stops a panel being dragged off the left or top', () => {
    expect(clampToViewport({ x: -500, y: -500 }, panel)).toEqual({ x: 8, y: 8 });
  });

  // Only the header needs to stay reachable — a 560px panel on a short window
  // would otherwise be pinned to the top and unable to move.
  it('keeps the header on screen rather than the whole panel', () => {
    const { y } = clampToViewport({ x: 100, y: 5000 }, panel);
    expect(y).toBe(800 - 48);
    expect(y).toBeGreaterThan(panel.height - 48);
  });

  // A position saved on a large monitor, reopened on a laptop.
  it('rescues a position stored for a much wider window', () => {
    setViewport(700, 600);
    const pos = clampToViewport({ x: 1800, y: 900 }, panel);
    expect(pos.x).toBeLessThanOrEqual(700);
    expect(pos.y).toBeLessThanOrEqual(600);
  });

  it('never returns a negative offset even when the panel exceeds the viewport', () => {
    setViewport(300, 400);
    const pos = clampToViewport({ x: 0, y: 0 }, panel);
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });
});

describe('isDraggableViewport', () => {
  it('is off below the breakpoint, where the panel is full-screen', () => {
    setViewport(500, 800);
    expect(isDraggableViewport()).toBe(false);
  });

  it('is on at desktop widths', () => {
    setViewport(1280, 800);
    expect(isDraggableViewport()).toBe(true);
  });
});
