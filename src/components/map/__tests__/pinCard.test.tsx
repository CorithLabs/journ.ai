import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import MapTab from '../../tabs/MapTab';
import { getPinActivities } from '../../../services/mapbox';
import { db, type Plan, type Activity } from '../../../db';

vi.mock('dexie-react-hooks');
vi.mock('../../../services/mapbox', async () => {
  const actual = await vi.importActual<typeof import('../../../services/mapbox')>('../../../services/mapbox');
  return { ...actual, getMapboxToken: () => 'pk.test', geocodePlanActivities: vi.fn(async () => new Set<string>()) };
});

/** The map itself needs a real Mapbox GL; the pins are what this is about. */
let clickPin: ((pin: unknown) => void) | null = null;
vi.mock('../MapboxMap', () => ({
  default: (props: { onPinClick: (p: unknown) => void; pins: unknown[]; selectedActivityId?: string | null }) => {
    clickPin = props.onPinClick;
    return (
      <div data-testid="fake-map" data-selected={props.selectedActivityId ?? ''}>
        {props.pins.length} pins
      </div>
    );
  },
}));

const act = (id: string, name: string, time: string, locationName: string): Activity => ({
  id, name, time, locationName, notes: '', pinnedToTodo: false,
  coordinates: locationName ? [139.7, 35.68] : undefined,
});

const plan: Plan = {
  id: 'p1', name: 'Tokyo', destination: 'Tokyo', country: 'Japan',
  startDate: '2025-07-14', endDate: '2025-07-15',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [{
    dayIndex: 0, label: 'Day 1 — Mon 14 Jul',
    activities: [act('a1', 'Museum', 'morning', 'Ueno'), act('a2', 'Dinner', 'evening', 'Shibuya')],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clickPin = null;
  vi.mocked(useLiveQuery).mockReturnValue(plan);
  vi.spyOn(db.plans, 'update').mockResolvedValue(1);
});

/*
 * The popup that used to live on the marker could never open: Mapbox toggles
 * it from a click handler on the MAP, reached by the event bubbling up from
 * the marker — and the marker's own stopPropagation cut that bubble. The
 * handler on this side was an empty function, so a pin tap did nothing at all.
 */
describe('tapping a pin', () => {
  it('opens the activity card', async () => {
    render(<MapTab planId="p1" />);
    expect(screen.queryByTestId('map-activity-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('day-selector-all'));
    clickPin!(getPinActivities(plan)[0]);

    await waitFor(() => expect(screen.getByTestId('map-activity-card')).toBeInTheDocument());
    expect(screen.getByTestId('map-activity-card')).toHaveTextContent('Museum');
  });

  // A card that looked like the itinerary's but did nothing would be worse
  // than no card at all.
  it('carries the actions the card has in the itinerary', async () => {
    render(<MapTab planId="p1" />);
    clickPin!(getPinActivities(plan)[0]);
    await waitFor(() => expect(screen.getByTestId('map-activity-card')).toBeInTheDocument());

    expect(screen.getByLabelText('Edit activity')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete activity')).toBeInTheDocument();
    expect(screen.getByLabelText('Open Museum in Google Maps')).toBeInTheDocument();
  });

  it('writes an edit through to the plan', async () => {
    render(<MapTab planId="p1" />);
    clickPin!(getPinActivities(plan)[0]);
    await waitFor(() => expect(screen.getByTestId('map-activity-card')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Edit activity'));
    fireEvent.click(screen.getByTestId('slot-night'));

    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    const written = vi.mocked(db.plans.update).mock.calls.slice(-1)[0][1] as { itinerary: Plan['itinerary'] };
    expect(written.itinerary[0].activities.find(a => a.id === 'a1')!.time).toBe('night');
  });

  it('tells the map which pin is open', async () => {
    render(<MapTab planId="p1" />);
    clickPin!(getPinActivities(plan)[1]);
    await waitFor(() => expect(screen.getByTestId('fake-map')).toHaveAttribute('data-selected', 'a2'));
  });

  it('closes again', async () => {
    render(<MapTab planId="p1" />);
    clickPin!(getPinActivities(plan)[0]);
    await waitFor(() => expect(screen.getByTestId('map-activity-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('close-map-card'));
    expect(screen.queryByTestId('map-activity-card')).not.toBeInTheDocument();
  });
});

describe('what the map admits it is not showing', () => {
  it('counts activities that can never be pinned', () => {
    const partial: Plan = {
      ...plan,
      itinerary: [{
        ...plan.itinerary[0],
        activities: [act('a1', 'Museum', 'morning', 'Ueno'), act('a2', 'Coffee', 'noon', '')],
      }],
    };
    vi.mocked(useLiveQuery).mockReturnValue(partial);
    render(<MapTab planId="p1" />);

    fireEvent.click(screen.getByTestId('day-selector-all'));
    expect(screen.getByTestId('all-days-summary')).toHaveTextContent('1 of 2 activities on the map');
    expect(screen.getByTestId('unlocated-count')).toHaveTextContent('1 without a location');
  });
});

describe('pin numbering', () => {
  // Pins were numbered by however the day happened to be stored, while the
  // itinerary renders in slot order — so pin 2 could be card 1.
  it('follows the order the itinerary renders in', () => {
    const outOfOrder: Plan = {
      ...plan,
      itinerary: [{
        ...plan.itinerary[0],
        activities: [act('late', 'Dinner', 'night', 'Shibuya'), act('early', 'Museum', 'morning', 'Ueno')],
      }],
    };
    const pins = getPinActivities(outOfOrder);
    expect(pins.map(p => [p.activity.id, p.sequenceNumber])).toEqual([['early', 1], ['late', 2]]);
  });
});
