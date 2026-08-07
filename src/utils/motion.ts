/**
 * Motion preference helpers.
 *
 * The global `prefers-reduced-motion` rule in index.css handles CSS
 * transitions and animations, but cannot reach scrolling driven from
 * JavaScript — `scrollIntoView({ behavior: 'smooth' })` ignores it, and
 * `scroll-behavior: auto !important` does not apply to an explicit argument.
 * These read the preference at call time so a mid-session change is honoured.
 */

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 'auto' when the user has asked for reduced motion, otherwise 'smooth'. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
