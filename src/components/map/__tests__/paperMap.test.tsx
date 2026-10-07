import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/render';
import PaperMap from '../PaperMap';
import { getPinActivities, type PinActivity } from '../../../services/places';
import type { Activity, Plan } from '../../../db';
import type { DiscoveredPlace } from '../../../services/discover';
import { districtOf, directionWord, splitNearFar, fitProjection, niceScaleKm, edgePoint } from '../paperGeometry';

const act = (id: string, name: string, at: [number, number], locationName = ''): Activity => ({
  id, name, time: 'morning', locationName, coordinates: at, notes: '', pinnedToTodo: false,
});

// The seeded Tokyo demo, at the coordinates OpenStreetMap gives.
const plan: Plan = {
  id: 'p1', name: 'Tokyo Explorer', destination: 'Tokyo, Japan',
  startDate: '2026-10-11', endDate: '2026-10-13',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [
    { dayIndex: 0, label: 'Day 1 — Tokyo Arrival', activities: [
      act('a', 'Tsukiji Outer Market', [139.7705, 35.6654], 'Tsukiji, Tokyo'),
      act('b', 'Senso-ji Temple', [139.7967, 35.7147], 'Asakusa, Tokyo'),
      act('c', 'Shibuya Crossing', [139.7006, 35.6595], 'Shibuya, Tokyo'),
    ] },
    { dayIndex: 1, label: 'Day 2 — Day Trip', activities: [
      act('d', 'Nikko Tosho-gu Shrine', [139.5991, 36.7576], 'Nikko, Japan'),
      act('e', 'Kegon Falls', [139.5020, 36.7380], 'Nikko, Japan'),
      act('f', 'Return to Tokyo', [139.6982, 35.6906], 'Tokyo, Japan'),
    ] },
  ],
};
const allPins = getPinActivities(plan);
const dayPins = (i: number) => allPins.filter((p) => p.dayIndex === i);

const show = (over: Partial<Parameters<typeof PaperMap>[0]> = {}) => {
  const props = {
    plan,
    selectedDayIndex: null as number | null,
    pins: allPins as PinActivity[],
    onDistanceChange: vi.fn(),
    onPinClick: vi.fn(),
    onViewportChange: vi.fn(),
    ...over,
  };
  render(<PaperMap {...props} />);
  return props;
};

describe('the sheet', () => {
  it('needs no token and loads nothing', () => {
    show();
    expect(screen.getByTestId('paper-map')).toBeInTheDocument();
    expect(document.querySelector('script, img, iframe')).toBeNull();
  });

  it('is titled with the trip, and with the day when one is shown', () => {
    show();
    expect(screen.getByText('Tokyo')).toBeInTheDocument();
    expect(screen.getByText('Tokyo Explorer · 11–13 Oct 2026')).toBeInTheDocument();
  });

  // A day spent away is titled by where it is.
  it('is titled by the town a day out goes to', () => {
    show({ selectedDayIndex: 1, pins: dayPins(1) });
    expect(screen.getByText('Nikko')).toBeInTheDocument();
  });

  it('names the neighbourhoods the stops are in', () => {
    show({ selectedDayIndex: 0, pins: dayPins(0) });
    expect(screen.getByText('ASAKUSA')).toBeInTheDocument();
    expect(screen.getByText('TSUKIJI')).toBeInTheDocument();
  });

  it('draws a scale', () => {
    show({ selectedDayIndex: 0, pins: dayPins(0) });
    expect(screen.getByTestId('paper-scale')).toBeInTheDocument();
  });
});

describe('pins', () => {
  it('numbers each stop as the day reads, and opens it when tapped', () => {
    const props = show({ selectedDayIndex: 0, pins: dayPins(0) });
    const pin = screen.getByRole('button', { name: 'Pin 2: Senso-ji Temple' });
    fireEvent.click(pin);
    expect(props.onPinClick).toHaveBeenCalledWith(expect.objectContaining({ sequenceNumber: 2 }));
  });

  it('opens from the keyboard too', () => {
    const props = show({ selectedDayIndex: 0, pins: dayPins(0) });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Pin 1: Tsukiji Outer Market' }), { key: 'Enter' });
    expect(props.onPinClick).toHaveBeenCalled();
  });

  it('marks the pin whose card is open', () => {
    show({ selectedDayIndex: 0, pins: dayPins(0), selectedActivityId: 'b' });
    expect(screen.getByRole('button', { name: 'Pin 2: Senso-ji Temple' })).toHaveAttribute('aria-pressed', 'true');
  });

  it("joins each day's stops in order", () => {
    show({ selectedDayIndex: 0, pins: dayPins(0) });
    expect(screen.getAllByTestId('paper-route')).toHaveLength(1);
  });
});

/*
 * Tokyo to Nikko is ~120km. Fitted at one scale, Tokyo's stops would be a
 * single dot; the day out gets its own box instead.
 */
describe('stops far from the rest', () => {
  it('puts a day trip in an inset when every day is shown', () => {
    show();
    const inset = screen.getByTestId('paper-inset');
    expect(inset).toHaveTextContent('Day 2 · Nikko');
    expect(inset).toHaveTextContent(/1\d\d km north of Tokyo/);
  });

  it('keeps the day trip tappable inside its inset', () => {
    const props = show();
    fireEvent.click(screen.getByRole('button', { name: 'Pin 2: Kegon Falls' }));
    expect(props.onPinClick).toHaveBeenCalledWith(expect.objectContaining({ dayIndex: 1 }));
  });

  // On the Nikko day, the train back to Tokyo is the one far away.
  it('turns a single far stop into an arrow saying how far and which way', () => {
    show({ selectedDayIndex: 1, pins: dayPins(1) });
    const arrow = screen.getByTestId('paper-edge-arrow');
    expect(arrow).toHaveTextContent(/Return to Tokyo · 1\d\d km south/);
  });
});

describe('what the map reports', () => {
  it("measures a day's route", () => {
    const props = show({ selectedDayIndex: 0, pins: dayPins(0) });
    const km = props.onDistanceChange.mock.calls.at(-1)?.[0];
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(25);
  });

  it('has no route to measure across all days', () => {
    const props = show();
    expect(props.onDistanceChange).toHaveBeenLastCalledWith(null);
  });

  // Discover searches the area on the sheet.
  it('reports the area the sheet shows, around the stops', () => {
    const props = show({ selectedDayIndex: 0, pins: dayPins(0) });
    const [w, s, e, n] = props.onViewportChange.mock.calls.at(-1)![0];
    expect(w).toBeLessThan(139.7006);
    expect(e).toBeGreaterThan(139.7967);
    expect(s).toBeLessThan(35.6595);
    expect(n).toBeGreaterThan(35.7147);
  });
});

describe('found places', () => {
  const found: DiscoveredPlace = {
    id: 'node/1', name: 'Kuramae Water Museum', category: 'landmarks', coordinates: [139.7914, 35.7017], kind: 'museum',
  };

  it('are drawn apart from the plan, and offered to be added', () => {
    const onDiscoveredClick = vi.fn();
    show({ selectedDayIndex: 0, pins: dayPins(0), discovered: [found], onDiscoveredClick });
    fireEvent.click(screen.getByRole('button', { name: 'Kuramae Water Museum — add to your trip' }));
    expect(onDiscoveredClick).toHaveBeenCalledWith(found);
  });

  it('are left off when they fall outside the sheet', () => {
    show({ selectedDayIndex: 0, pins: dayPins(0), discovered: [{ ...found, coordinates: [135.5, 34.7] }] });
    expect(screen.queryByTestId('discovered-pin')).not.toBeInTheDocument();
  });
});

describe('the geometry', () => {
  it('splits off what is far from the main group', () => {
    const { near, far } = splitNearFar([[139.77, 35.66], [139.79, 35.71], [139.70, 35.66], [139.60, 36.76]]);
    expect(near).toEqual([0, 1, 2]);
    expect(far).toEqual([3]);
  });

  it('fits the points inside the padded box', () => {
    const P = fitProjection([[139.70, 35.66], [139.80, 35.71]], { x: 0, y: 0, w: 800, h: 600 }, { l: 50, r: 50, t: 50, b: 50 });
    for (const at of [[139.70, 35.66], [139.80, 35.71]] as Array<[number, number]>) {
      const [x, y] = P.xy(at);
      expect(x).toBeGreaterThanOrEqual(49.9);
      expect(x).toBeLessThanOrEqual(750.1);
      expect(y).toBeGreaterThanOrEqual(49.9);
      expect(y).toBeLessThanOrEqual(550.1);
    }
    // ll undoes xy.
    const [lng, lat] = P.ll(...P.xy([139.75, 35.68]));
    expect(lng).toBeCloseTo(139.75, 6);
    expect(lat).toBeCloseTo(35.68, 6);
  });

  it('picks a round number for the scale', () => {
    expect(niceScaleKm(55, 110)).toBe(2);
    expect(niceScaleKm(500, 110)).toBe(0.25);
  });

  it('says which way', () => {
    expect(directionWord([139.69, 35.69], [139.60, 36.76])).toBe('north');
    expect(directionWord([139.69, 35.69], [135.50, 34.69])).toBe('west');
  });

  it('puts an edge arrow on the frame', () => {
    expect(edgePoint([100, 100], [100, 900], { x: 0, y: 0, w: 200, h: 300 })).toEqual([100, 300]);
  });

  it('reads a district only where the location names one', () => {
    const cities = ['Tokyo, Japan'];
    expect(districtOf('Asakusa, Tokyo', 'Senso-ji', cities)).toBe('Asakusa');
    expect(districtOf('Senso-ji Temple', 'Senso-ji', cities)).toBeNull();
    expect(districtOf('Tokyo, Japan', 'Return', cities)).toBeNull();
    expect(districtOf('1-22-7 Jinnan, Shibuya', 'Ichiran', cities)).toBeNull();
  });
});
