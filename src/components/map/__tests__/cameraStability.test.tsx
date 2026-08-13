import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { useLiveQuery } from 'dexie-react-hooks';
import MapTab from '../../tabs/MapTab';
import { db, type Plan, type Activity } from '../../../db';
import type { BBox } from '../../../services/discover';

vi.mock('dexie-react-hooks');
vi.mock('../../../services/mapbox', async () => {
  const actual = await vi.importActual<typeof import('../../../services/mapbox')>('../../../services/mapbox');
  return { ...actual, getMapboxToken: () => 'pk.test', geocodePlanActivities: vi.fn(async () => new Set<string>()) };
});

/*
 * The map is stubbed at the seam that matters: how often it is handed a pin
 * array that is not the one it already had. A new array is what makes the real
 * map reframe, so counting those is counting the times the view would jump.
 */
let currentPins: unknown = null;
let rebuilds = 0;
let setViewport: ((b: BBox) => void) | null = null;
vi.mock('../MapboxMap', () => ({
  default: (props: { pins: unknown[]; onViewportChange?: (b: BBox) => void }) => {
    // Identity, not contents: a new array is what makes the real map reframe,
    // however similar it looks.
    if (props.pins !== currentPins) {
      currentPins = props.pins;
      rebuilds += 1;
    }
    setViewport = props.onViewportChange ?? null;
    return <div data-testid="fake-map">{props.pins.length} pins</div>;
  },
}));

const act = (id: string): Activity => ({
  id, name: id, time: 'morning', locationName: 'Shibuya',
  notes: '', pinnedToTodo: false, coordinates: [139.7, 35.68],
});

const plan: Plan = {
  id: 'p1', name: 'Tokyo', destination: 'Tokyo', country: 'Japan',
  startDate: '2025-07-14', endDate: '2025-07-15',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [{ dayIndex: 0, label: 'Day 1', activities: [act('a'), act('b')] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  currentPins = null;
  rebuilds = 0;
  setViewport = null;
  vi.mocked(useLiveQuery).mockReturnValue(plan);
  vi.spyOn(db.plans, 'update').mockResolvedValue(1);
});

/*
 * Pinching to zoom moved the map, which reported a new viewport, which
 * re-rendered the tab, which rebuilt the pin array during render, which made
 * the map reframe the camera. The zoom was undone by the act of zooming, and
 * every test in the suite passed while it happened.
 */
describe('the camera stays where it is put', () => {
  it('does not rebuild the pins when the map reports a new viewport', async () => {
    render(<MapTab planId="p1" />);
    await waitFor(() => expect(screen.getByTestId('fake-map')).toBeInTheDocument());
    const before = rebuilds;

    setViewport?.([139.6, 35.6, 139.8, 35.7]);
    setViewport?.([139.5, 35.5, 139.9, 35.8]);

    await waitFor(() => expect(screen.getByTestId('fake-map')).toBeInTheDocument());
    expect(rebuilds).toBe(before);
  });

  it('does not rebuild them when a discovery filter is switched on', async () => {
    render(<MapTab planId="p1" />);
    setViewport?.([139.68, 35.65, 139.72, 35.70]);
    await waitFor(() => expect(screen.getByTestId('fake-map')).toBeInTheDocument());
    const before = rebuilds;

    fireEvent.click(screen.getByTestId('discover-filter-landmarks'));

    await waitFor(() => expect(screen.getByTestId('discover-count')).toBeInTheDocument());
    expect(rebuilds).toBe(before);
  });

  // Changing what is being looked at is the one case where the camera should
  // move. The tab opens on a day, so switching to all days is the real change.
  it('hands down a new set when the selection changes', async () => {
    render(<MapTab planId="p1" />);
    await waitFor(() => expect(screen.getByTestId('fake-map')).toBeInTheDocument());
    const before = rebuilds;

    fireEvent.click(screen.getByTestId('day-selector-all'));

    // The selection is debounced before the camera is asked to follow it.
    await waitFor(() => expect(rebuilds).toBeGreaterThan(before), { timeout: 2000 });
  });
});
