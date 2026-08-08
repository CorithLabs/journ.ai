export const ONBOARDED_STORAGE = 'aitp_onboarded';

/**
 * Whether the introduction has been seen.
 *
 * Deliberately not tied to whether any plans exist: someone who cleared their
 * data has not forgotten what the app is, and a first plan created from a
 * shared link should not re-trigger it. One flag, set when the flow is
 * finished or skipped.
 */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_STORAGE) === '1';
  } catch {
    // Storage can be unavailable in private modes. Showing the intro every
    // time would be worse than never showing it.
    return true;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_STORAGE, '1');
  } catch {
    /* nothing to do — the intro simply shows again next time */
  }
}

/** Used by Settings to offer the introduction again. */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDED_STORAGE);
  } catch {
    /* ignore */
  }
}

/**
 * Reopen the introduction from elsewhere in the app.
 *
 * The shell reads the flag once on mount — re-reading it would tear the flow
 * down mid-step the moment it is written — so clearing the flag alone would
 * not bring it back until a reload. An event asks directly.
 */
export const SHOW_ONBOARDING_EVENT = 'journai:show-onboarding';

export function requestOnboarding(): void {
  resetOnboarding();
  window.dispatchEvent(new Event(SHOW_ONBOARDING_EVENT));
}
