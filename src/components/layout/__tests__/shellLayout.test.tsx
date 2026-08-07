import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import AppShell from '../AppShell';
import Sidebar from '../Sidebar';
import TabBar from '../TabBar';

vi.mock('dexie-react-hooks');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
});

/**
 * A flex item defaults to min-height:auto, so without min-h-0 it cannot shrink
 * below its content and any descendant's overflow-y-auto never engages. That is
 * what stopped Settings scrolling and pushed the sidebar's Settings button off
 * a phone screen once the shell stopped scrolling.
 */
describe('shell scroll containment', () => {
  it('the main content area can shrink so its panes can scroll', () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByTestId('main-content').className).toContain('min-h-0');
  });

  it('the sidebar plan list scrolls instead of pushing the footer out of view', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    const list = screen.getByLabelText('Your plans');
    expect(list.className).toContain('min-h-0');
    expect(list.className).toContain('overflow-y-auto');
    // The footer must remain reachable — this is the button that disappeared.
    expect(screen.getByTestId('sidebar-settings-btn')).toBeInTheDocument();
  });
});

describe('TabBar placement', () => {
  it('sits below the content on phones and above it on desktop', () => {
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    const nav = screen.getByTestId('tab-bar');
    expect(nav.className).toContain('order-last');
    expect(nav.className).toContain('md:order-first');
  });

  it('moves its divider to the top edge when bottom-anchored', () => {
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    const nav = screen.getByTestId('tab-bar');
    expect(nav.className).toContain('border-t');
    expect(nav.className).toContain('md:border-b');
  });
});
