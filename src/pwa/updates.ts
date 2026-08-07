import { registerSW } from 'virtual:pwa-register';

/**
 * Keeping an installed PWA current.
 *
 * skipWaiting and clientsClaim (vite.config.ts) make a NEW worker take over
 * promptly — but only once the browser has noticed one exists. It checks on
 * navigation, and an installed app can run for days without navigating, so a
 * phone can sit on a months-old build indefinitely. That is what happened on
 * Chrome while Firefox, registering for the first time, looked fine.
 *
 * Two things fix it: ask for an update on a schedule and whenever the app is
 * brought back to the foreground, then reload once the new worker is actually
 * in control.
 */

/** How often to ask the browser to re-fetch the worker script. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function initAppUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  /*
   * Whether a worker was already controlling this page at startup.
   *
   * clientsClaim makes `controllerchange` fire on a FIRST install too, when a
   * page that loaded uncontrolled gets claimed. Reloading then would refresh
   * every first-time visitor for no reason — and on a slow connection could
   * loop. Only a change away from an existing controller means the build the
   * user is looking at is stale.
   */
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const check = () => {
        // An offline check just throws; the next foreground will retry.
        if (navigator.onLine) registration.update().catch(() => {});
      };

      setInterval(check, UPDATE_INTERVAL_MS);

      // The moment that matters most: the user has just come back to the app,
      // which for an installed PWA may be the only "navigation" it ever sees.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('online', check);
    },
  });
}
