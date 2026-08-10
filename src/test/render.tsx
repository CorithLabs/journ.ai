import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ConfirmProvider } from '../components/ui/ConfirmDialog';

/**
 * render() with the app-level providers a component can assume are there.
 *
 * ConfirmProvider is mounted once at the root, like the router, so anything
 * that asks the user before doing something irreversible expects to find it.
 * useConfirm throws without it rather than falling back — a missing provider
 * must not quietly turn "are you sure?" into "yes".
 */
export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: ConfirmProvider, ...options });
}

// Re-exported by name rather than with `export *`: a star re-export of
// @testing-library/react brings its own `render` along, and which one wins is
// not worth relying on.
export { screen, fireEvent, waitFor, act, within, cleanup } from '@testing-library/react';
