import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { useLiveQuery } from 'dexie-react-hooks';
import MapTab from '../../tabs/MapTab';
import { db, type Plan } from '../../../db';
import * as discover from '../../../services/discover';
import type { BBox, DiscoveredPlace } from '../../../services/discover';

vi.mock('dexie-react-hooks');
vi.mock('../../../services/mapbox', async () => {
  const actual = await vi.importActual<typeof import('../../../services/mapbox')>('../../../services/mapbox');
  return { ...actual, getMapboxToken: () => 'pk.test', geocodePlanActivities: vi.fn(async () => new Set<string>()) };
});

/** The real map needs Mapbox GL; this stands in for it and reports a viewport. */
let clickPlace: ((p: DiscoveredPlace) => void) | null = null;
let setViewport: ((b: BBox) => void) | null = null;
vi.mock('../MapboxMap', () => ({
  default: (props: {
    discovered?: DiscoveredPlace[];
    onDiscoveredClick?: (p: DiscoveredPlace) => void;
    onViewportChange?: (b: BBox) => void;
  }) => {
    clickPlace = props.onDiscoveredClick ?? null;
    setViewport = props.onViewportChange ?? null;
    return <div data-testid="fake-map">{props.discovered?.length ?? 0} found</div>;
  },
}));

const KITS: DiscoveredPlace = {
  id: 'node/1',
  name: 'Kitsilano Beach',
  category: 'nature',
  coordinates: [-123.1553, 49.2734],
  kind: 'beach',
};

const VANCOUVER: BBox = [-123.18, 49.25, -123.10, 49.30];

const plan: Plan = {
  id: 'p1', name: 'Vancouver', destination: 'Vancouver', country: 'Canada',
  startDate: '2025-07-14', endDate: '2025-07-15',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [
    { dayIndex: 0, label: 'Day 1 — Mon 14 Jul', activities: [] },
    { dayIndex: 1, label: 'Day 2 — Tue 15 Jul', activities: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clickPlace = null;
  setViewport = null;
  discover.clearDiscoverCache();
  vi.mocked(useLiveQuery).mockReturnValue(plan);
  vi.spyOn(db.plans, 'update').mockResolvedValue(1);
  vi.spyOn(discover, 'discoverPlaces').mockResolvedValue([KITS]);
});

const openMap = () => {
  render(<MapTab planId="p1" />);
  // The real map reports its bounds once it has loaded.
  setViewport?.(VANCOUVER);
};

/*
 * The map could only ever draw decisions already made — a list can do
 * everything it did except measure the distance between two stops. This is the
 * map earning its tab.
 */
describe('finding places on the map', () => {
  it('asks for nothing until a filter is switched on', () => {
    openMap();
    expect(discover.discoverPlaces).not.toHaveBeenCalled();
  });

  it('searches the area on screen when a filter is turned on', async () => {
    openMap();

    fireEvent.click(screen.getByTestId('discover-filter-nature'));

    await waitFor(() => expect(discover.discoverPlaces).toHaveBeenCalled());
    expect(vi.mocked(discover.discoverPlaces).mock.calls[0][1]).toEqual(VANCOUVER);
    await waitFor(() => expect(screen.getByTestId('discover-count')).toHaveTextContent('1 found'));
  });

  it('stops searching, and clears the map, when the filter goes off again', async () => {
    openMap();
    fireEvent.click(screen.getByTestId('discover-filter-nature'));
    await waitFor(() => expect(screen.getByTestId('fake-map')).toHaveTextContent('1 found'));

    fireEvent.click(screen.getByTestId('discover-filter-nature'));

    await waitFor(() => expect(screen.getByTestId('fake-map')).toHaveTextContent('0 found'));
  });

  it('says to zoom in rather than asking about half a continent', async () => {
    render(<MapTab planId="p1" />);
    setViewport?.([-130, 30, -70, 55]);
    fireEvent.click(screen.getByTestId('discover-filter-nature'));

    await waitFor(() =>
      expect(screen.getByTestId('discover-count')).toHaveTextContent('Zoom in to search'));
    expect(discover.discoverPlaces).not.toHaveBeenCalled();
  });
});

/*
 * A tap that silently put something in a day would mean reading the itinerary
 * to find out what you had just done.
 */
describe('adding what the map found', () => {
  const openPlace = async () => {
    openMap();
    fireEvent.click(screen.getByTestId('discover-filter-nature'));
    await waitFor(() => expect(screen.getByTestId('fake-map')).toHaveTextContent('1 found'));
    clickPlace!(KITS);
    return screen.findByTestId('discovered-card');
  };

  it('shows what it is before offering to add it', async () => {
    const card = await openPlace();
    expect(card).toHaveTextContent('Kitsilano Beach');
    expect(card).toHaveTextContent('beach');
    // Nothing that would age: the app promises not to be a live service.
    expect(card).not.toHaveTextContent(/open|hours|rating|\$/i);
  });

  it('asks which day rather than guessing', async () => {
    await openPlace();

    fireEvent.click(screen.getByTestId('discovered-add'));

    expect(screen.getByTestId('discovered-day-picker')).toBeInTheDocument();
    expect(screen.getByTestId('discovered-add-day-0')).toHaveTextContent('Day 1');
    expect(screen.getByTestId('discovered-add-day-1')).toHaveTextContent('Day 2');
  });

  /*
   * The point of picking off the map: it arrives with its coordinates already
   * settled, so it is on the map the moment it is added and there is nothing
   * left to geocode.
   */
  it('adds it to the chosen day with its location already resolved', async () => {
    await openPlace();
    fireEvent.click(screen.getByTestId('discovered-add'));

    fireEvent.click(screen.getByTestId('discovered-add-day-1'));

    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    const saved = vi.mocked(db.plans.update).mock.calls[0][1] as { itinerary: Plan['itinerary'] };
    expect(saved.itinerary[0].activities).toHaveLength(0);
    expect(saved.itinerary[1].activities[0]).toMatchObject({
      name: 'Kitsilano Beach',
      locationName: 'Kitsilano Beach',
      coordinates: [-123.1553, 49.2734],
    });
  });

  it('says where it went, and closes', async () => {
    await openPlace();
    fireEvent.click(screen.getByTestId('discovered-add'));
    fireEvent.click(screen.getByTestId('discovered-add-day-0'));

    await waitFor(() =>
      expect(screen.getByText(/added to Day 1/)).toBeInTheDocument());
    expect(screen.queryByTestId('discovered-card')).not.toBeInTheDocument();
  });

  it('closes without adding anything', async () => {
    await openPlace();

    fireEvent.click(screen.getByTestId('discovered-close'));

    expect(screen.queryByTestId('discovered-card')).not.toBeInTheDocument();
    expect(db.plans.update).not.toHaveBeenCalled();
  });
});
