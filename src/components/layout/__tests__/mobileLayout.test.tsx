import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Sidebar from '../Sidebar';
import ActivityCard from '../../itinerary/ActivityCard';
import type { Activity } from '../../../db';

vi.mock('dexie-react-hooks');

const setWidth = (w: number) => vi.stubGlobal('innerWidth', w);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe('Sidebar on small screens', () => {
  // Expanded, it is a 240px fixed overlay — on a 375px screen it covers the
  // app and sits on top of it, so nothing underneath can be read or tapped.
  it('starts collapsed on a phone', () => {
    setWidth(375);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(screen.getByTestId('sidebar').className).toContain('w-14');
  });

  it('starts expanded on desktop, where the rail is the point of it', () => {
    setWidth(1280);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(screen.getByTestId('sidebar').className).toContain('w-60');
  });
});

const activity: Activity = {
  id: 'a1', name: 'Museum', time: '10:00',
  locationName: 'Ueno', notes: '', pinnedToTodo: false,
};

describe('ActivityCard controls on touch', () => {
  // These were opacity-0 until hover. Touch has no hover, so pin, edit and
  // delete were invisible and unreachable on a phone.
  it('shows its actions without needing hover', () => {
    render(
      <ActivityCard act={activity} onDel={vi.fn()} onUpd={vi.fn()} onPin={vi.fn()} />,
    );
    for (const label of ['Pin to to-do', 'Edit activity', 'Delete activity']) {
      const btn = screen.getByLabelText(label);
      expect(btn).toBeVisible();
      // Reveal-on-hover is kept for pointers only.
      expect(btn.parentElement!.className).toContain('opacity-100');
      expect(btn.parentElement!.className).toContain('md:opacity-0');
    }
  });

  it('gives each action a comfortable target on touch', () => {
    render(
      <ActivityCard act={activity} onDel={vi.fn()} onUpd={vi.fn()} onPin={vi.fn()} />,
    );
    const btn = screen.getByLabelText('Edit activity');
    expect(btn.className).toContain('p-2.5');
    expect(btn.className).toContain('md:p-1');
  });
});
