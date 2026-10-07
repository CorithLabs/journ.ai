import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../AppShell';
import { useLiveQuery } from 'dexie-react-hooks';
import { setViewport, PHONE, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');
vi.mocked(useLiveQuery).mockReturnValue([]);

describe('AppShell', () => {
  it('renders the app shell with sidebar and main content', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  it('main content area is flex-1', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    const main = screen.getByTestId('main-content');
    expect(main).toHaveClass('flex-1');
  });

  afterEach(() => vi.unstubAllGlobals());

  // The menu button floats at the top left. With no bar under it, it sat on
  // whatever each page put there: the demo banner, a page title.
  it('gives a phone a top bar that the menu button sits over', () => {
    setViewport(PHONE);
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    const bar = screen.getByTestId('mobile-header');
    expect(bar.className).toContain('pl-16');
    expect(bar.className).toContain('safe-area-inset-top');
    expect(screen.getByTestId('main-content').firstElementChild).toBe(bar);
  });

  it('has no top bar on desktop, where the sidebar is always there', () => {
    setViewport(DESKTOP);
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.queryByTestId('mobile-header')).not.toBeInTheDocument();
  });
});
