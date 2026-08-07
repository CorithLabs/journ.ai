import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Sidebar from '../Sidebar';
import ActivityCard from '../../itinerary/ActivityCard';
import type { Activity } from '../../../db';

vi.mock('dexie-react-hooks');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
});
afterEach(() => vi.unstubAllGlobals());

const activity: Activity = {
  id: 'a1', name: 'Museum', time: '10:00',
  locationName: 'Ueno', notes: '', pinnedToTodo: false,
};

describe('ActivityCard actions', () => {
  const plan = { destination: 'Ottawa, Canada', country: 'Canada' };

  // These used to be revealed on hover, which meant they did not exist on
  // touch at all. They now live permanently on the card's edge rail.
  it('exposes every action without needing hover', () => {
    render(
      <ActivityCard act={activity} plan={plan} onDel={vi.fn()} onUpd={vi.fn()} onPin={vi.fn()} />,
    );
    expect(screen.getByTestId('activity-actions')).toBeInTheDocument();
    for (const label of [/Pin to to-do/, /Edit activity/, /Delete activity/]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
  });

  it('offers a Google Maps link for a located activity', () => {
    render(
      <ActivityCard act={activity} plan={plan} onDel={vi.fn()} onUpd={vi.fn()} onPin={vi.fn()} />,
    );
    const link = screen.getByTestId('activity-maps');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('href')).toContain('google.com/maps');
  });

  // The name is what the user scans for; it used to truncate behind the
  // buttons ("Visit to Royal Mu...").
  it('does not truncate the activity name', () => {
    const long = { ...activity, name: 'Visit to Royal Ontario Museum and Gardens' };
    render(
      <ActivityCard act={long} plan={plan} onDel={vi.fn()} onUpd={vi.fn()} onPin={vi.fn()} />,
    );
    const el = screen.getByText('Visit to Royal Ontario Museum and Gardens');
    expect(el.className).not.toContain('truncate');
    expect(el.className).toContain('break-words');
  });
});
