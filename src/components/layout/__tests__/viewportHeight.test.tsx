import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import AppShell from '../AppShell';

vi.mock('dexie-react-hooks');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
});

/**
 * On mobile, 100vh is the LARGE viewport — it includes the space behind the
 * browser's retractable URL bar — so a 100vh shell is taller than the screen.
 * With `overflow: hidden` on the body, everything at the bottom of the shell
 * (the tab bar, the sidebar's Settings button) is clipped away with no way to
 * scroll to it. #root is sized with dvh instead; the shell must inherit that
 * rather than re-asserting 100vh.
 */
describe('shell height', () => {
  it('inherits the dynamic viewport instead of re-asserting 100vh', () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    const shell = screen.getByTestId('app-shell');
    expect(shell.className).toContain('h-full');
    expect(shell.className).not.toContain('h-screen');
  });
});
