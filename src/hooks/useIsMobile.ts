import { useEffect, useState } from 'react';

/**
 * Reactive viewport breakpoint.
 *
 * CSS `md:` classes cover styling, but the phone and desktop shells are
 * different structures — an off-canvas drawer versus an in-flow rail, a
 * floating bottom bar versus a top tab strip — so the choice has to be made in
 * JS. Reading window.innerWidth once at mount is not enough: it misses
 * rotation and desktop window resizes, leaving the wrong shell in place.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    // matchMedia fires only when the breakpoint is actually crossed, unlike a
    // resize listener that runs on every pixel of a drag.
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}
