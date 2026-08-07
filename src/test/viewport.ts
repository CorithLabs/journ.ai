import { vi } from 'vitest';

/**
 * Drive useIsMobile() in tests.
 *
 * jsdom provides matchMedia but reports `matches: false` for everything, so a
 * component would always resolve to the desktop shell no matter what
 * innerWidth said. Both are stubbed together to keep them consistent.
 */
export function setViewport(width: number, height = 800) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  vi.stubGlobal(
    'matchMedia',
    (query: string) => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      const min = /min-width:\s*(\d+)px/.exec(query);
      const matches = max
        ? width <= Number(max[1])
        : min
          ? width >= Number(min[1])
          : false;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    },
  );
}

export const PHONE = 375;
export const DESKTOP = 1280;
