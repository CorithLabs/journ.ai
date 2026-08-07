import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Sidebar from '../Sidebar';
import TabBar from '../TabBar';
import { setViewport, PHONE, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * Phone and desktop are different structures, not one layout with different
 * paddings. Driving both from a single `collapsed` boolean made it mean a
 * width on desktop and a position on mobile, and the two meanings fought —
 * which is why the drawer would not open.
 */
describe('Sidebar as a phone drawer', () => {
  const classes = () => screen.getByTestId('sidebar').className;

  it('is off-canvas and full width when closed, not a narrow rail', () => {
    setViewport(PHONE);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(classes()).toContain('-translate-x-full');
    expect(classes()).toContain('w-60');
    expect(classes()).not.toContain('w-14');
  });

  it('offers a trigger outside the drawer, so it stays reachable when hidden', () => {
    setViewport(PHONE);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(screen.getByTestId('sidebar-open-btn')).toBeInTheDocument();
  });

  it('slides open when the trigger is used', () => {
    setViewport(PHONE);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('sidebar-open-btn'));
    expect(classes()).toContain('translate-x-0');
    expect(classes()).not.toContain('-translate-x-full');
    expect(screen.getByTestId('sidebar-scrim')).toBeInTheDocument();
  });

  it('closes again from the scrim', () => {
    setViewport(PHONE);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('sidebar-open-btn'));
    fireEvent.click(screen.getByTestId('sidebar-scrim'));
    expect(classes()).toContain('-translate-x-full');
  });

  // Tailwind emits .fixed before .relative, so both applying at once silently
  // cancels the overlay and the sidebar takes flow width on a phone.
  it('never applies relative and fixed together', () => {
    for (const w of [PHONE, DESKTOP]) {
      setViewport(w);
      const { unmount } = render(<MemoryRouter><Sidebar /></MemoryRouter>);
      const cls = classes();
      expect(/\bfixed\b/.test(cls) && /(^|\s)relative(\s|$)/.test(cls)).toBe(false);
      unmount();
    }
  });

  it('stays an in-flow rail on desktop', () => {
    setViewport(DESKTOP);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(classes()).toContain('relative');
    expect(classes()).not.toContain('translate-x');
    expect(screen.queryByTestId('sidebar-open-btn')).not.toBeInTheDocument();
  });
});

describe('TabBar as a phone pill', () => {
  const classes = () => screen.getByTestId('tab-bar').className;

  // A full-width in-flow bar was being clipped at the screen edges.
  it('floats inset from both edges and above the home indicator', () => {
    setViewport(PHONE);
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(classes()).toContain('fixed');
    expect(classes()).toContain('left-3');
    expect(classes()).toContain('right-3');
    expect(classes()).toContain('safe-area-inset-bottom');
  });

  it('stays a top strip on desktop', () => {
    setViewport(DESKTOP);
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(classes()).toContain('border-b');
    expect(classes()).not.toContain('fixed');
  });
});
