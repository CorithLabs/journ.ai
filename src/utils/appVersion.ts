/**
 * Build identity, injected by Vite from package.json (see vite.config.ts).
 *
 * Wrapped rather than read inline so tests and any non-Vite consumer have a
 * single place to stub, and so a missing define degrades to a readable value
 * instead of a ReferenceError.
 */

function read(name: string, fallback: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (globalThis as any)[name];
    return typeof v === 'string' && v ? v : fallback;
  } catch {
    return fallback;
  }
}

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : read('__APP_VERSION__', 'dev');

export const BUILD_SHA: string =
  typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : read('__BUILD_SHA__', '');

/** e.g. "v0.2.0 · a1b2c3d", or just "v0.2.0" when built outside Vercel. */
export function versionLabel(): string {
  return BUILD_SHA ? `v${APP_VERSION} · ${BUILD_SHA}` : `v${APP_VERSION}`;
}
