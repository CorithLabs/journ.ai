import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NewPlanModal from '../NewPlanModal';
import { db, type Plan } from '../../../db';
import { buildItineraryPrompt } from '../../itinerary/itineraryPrompt';

vi.mock('../../../services/destinations', async () => {
  const actual = await vi.importActual<typeof import('../../../services/destinations')>('../../../services/destinations');
  return { ...actual, searchDestinations: vi.fn(async () => []) };
});

const created = () => vi.mocked(db.plans.add).mock.calls[0][0] as Plan;

const fill = () => {
  fireEvent.change(screen.getByTestId('destination-input'), { target: { value: 'Kyoto, Japan' } });
  fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2025-07-14' } });
  fireEvent.change(screen.getByTestId('end-date-input'), { target: { value: '2025-07-18' } });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(db.plans, 'add').mockResolvedValue('p1');
});

const show = () => render(<MemoryRouter><NewPlanModal onClose={vi.fn()} /></MemoryRouter>);

describe('the simple case stays simple', () => {
  // Asking more questions must not mean a wall of fields for someone who only
  // knows where and when.
  it('keeps the extra questions collapsed', () => {
    show();
    expect(screen.queryByTestId('arrival-city')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stop-city-0')).not.toBeInTheDocument();
  });

  it('stores nothing for sections that were never opened', async () => {
    show();
    fill();
    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
    const plan = created();
    expect(plan.arrival).toBeUndefined();
    expect(plan.departure).toBeUndefined();
    expect(plan.stops).toBeUndefined();
  });
});

describe('arrival and departure', () => {
  it('records how, where and when, at both ends', async () => {
    show();
    fill();
    fireEvent.click(screen.getByTestId('toggle-travel'));

    fireEvent.click(screen.getByTestId('arrival-mode-train'));
    fireEvent.change(screen.getByTestId('arrival-city'), { target: { value: 'Osaka' } });
    fireEvent.change(screen.getByTestId('arrival-time'), { target: { value: '22:40' } });

    fireEvent.click(screen.getByTestId('departure-mode-bus'));
    fireEvent.change(screen.getByTestId('departure-time'), { target: { value: '07:15' } });

    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
    const plan = created();
    expect(plan.arrival).toEqual({ mode: 'train', city: 'Osaka', time: '22:40' });
    expect(plan.departure).toEqual({ mode: 'bus', time: '07:15' });
  });

  // Every mode is offered, not just the one the app used to assume.
  it('offers more than flying', () => {
    show();
    fireEvent.click(screen.getByTestId('toggle-travel'));
    for (const mode of ['flight', 'train', 'bus', 'car', 'ferry', 'other']) {
      expect(screen.getByTestId(`arrival-mode-${mode}`)).toBeInTheDocument();
    }
  });
});

describe('multi-city', () => {
  it('records further cities in visit order', async () => {
    show();
    fill();
    fireEvent.click(screen.getByTestId('toggle-stops'));
    fireEvent.click(screen.getByTestId('add-stop'));
    fireEvent.change(screen.getByTestId('stop-city-0'), { target: { value: 'Osaka' } });
    fireEvent.change(screen.getByTestId('stop-nights-0'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('add-stop'));
    fireEvent.change(screen.getByTestId('stop-city-1'), { target: { value: 'Nara' } });

    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
    expect(created().stops?.map(s => s.city)).toEqual(['Osaka', 'Nara']);
    expect(created().stops?.[0].nights).toBe(2);
  });

  // The order is the route, so getting it wrong should not mean deleting a
  // city and typing it again further down.
  it('lets the cities be reordered', async () => {
    show();
    fill();
    fireEvent.click(screen.getByTestId('toggle-stops'));
    fireEvent.click(screen.getByTestId('add-stop'));
    fireEvent.change(screen.getByTestId('stop-city-0'), { target: { value: 'Matane' } });
    fireEvent.click(screen.getByTestId('add-stop'));
    fireEvent.change(screen.getByTestId('stop-city-1'), { target: { value: 'Rimouski' } });
    fireEvent.click(screen.getByTestId('stop-up-1'));

    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
    expect(created().stops?.map(s => s.city)).toEqual(['Rimouski', 'Matane']);
  });

  it('cannot move the ends off either edge', () => {
    show();
    fireEvent.click(screen.getByTestId('toggle-stops'));
    fireEvent.click(screen.getByTestId('add-stop'));
    expect(screen.getByTestId('stop-up-0')).toBeDisabled();
    expect(screen.getByTestId('stop-down-0')).toBeDisabled();
  });

  it('drops a row left blank', async () => {
    show();
    fill();
    fireEvent.click(screen.getByTestId('toggle-stops'));
    fireEvent.click(screen.getByTestId('add-stop'));
    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
    expect(created().stops).toBeUndefined();
  });
});

describe('whether the trip crosses a border', () => {
  it('records a domestic trip, which needs no visa task at all', async () => {
    show();
    fill();
    fireEvent.click(screen.getByTestId('border-domestic'));
    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
    expect(created().international).toBe(false);
  });

  // Unsure is the default and stays unrecorded, so the to-do list keeps
  // asking rather than deciding.
  it('leaves it unset when nobody says', async () => {
    show();
    fill();
    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
    expect(created().international).toBeUndefined();
  });
});

describe('what the itinerary prompt is told', () => {
  const plan = (extra: Partial<Plan>): Plan => ({
    id: 'p1', name: 'Kyoto', destination: 'Kyoto', country: 'Japan',
    startDate: '2025-07-14', endDate: '2025-07-18',
    createdAt: '', updatedAt: '', deleted: false, itinerary: [], ...extra,
  });

  /*
   * The first and last days are what a generic itinerary always gets wrong:
   * a full programme on a day the traveller lands at 22:40.
   */
  it('passes on the arrival, so the first day can be light', () => {
    const out = buildItineraryPrompt(plan({ arrival: { mode: 'flight', city: 'Osaka', time: '22:40' } }));
    expect(out).toContain('Arrival: Flight · Osaka · 22:40');
    expect(out).toMatch(/first day light/i);
  });

  it('passes on the cities and how long in each', () => {
    const out = buildItineraryPrompt(plan({
      stops: [{ id: '1', city: 'Osaka', nights: 2 }, { id: '2', city: 'Nara', nights: 1 }],
    }));
    expect(out).toContain('Kyoto → Osaka (2 nights) → Nara (1 night)');
  });

  /*
   * A Montreal → Percé road trip was sent as "in order: Percé, Matane,
   * Rimouski, Percé", so the itinerary started and ended at the far point.
   */
  it('sends a road trip out and back, not from the far end', () => {
    const out = buildItineraryPrompt(plan({
      destination: 'Percé',
      arrival: { city: 'Montreal', mode: 'car' },
      departure: { city: 'Montreal', mode: 'car' },
      stops: [{ id: '1', city: 'Matane' }, { id: '2', city: 'Percé' }],
    }));
    expect(out).toContain('Montreal → Matane → Percé → Montreal');
    expect(out).toContain('starts in Montreal and ends in Montreal');
  });

  // A flight-shaped itinerary never suggests stopping somewhere on the way.
  it('says a road trip can stop along the route', () => {
    expect(buildItineraryPrompt(plan({ arrival: { mode: 'car' } }))).toMatch(/stops along the route/i);
  });

  it('stays quiet about travel nobody has described', () => {
    const out = buildItineraryPrompt(plan({}));
    expect(out).not.toContain('Arrival:');
    expect(out).not.toContain('Multi-city');
  });
});
