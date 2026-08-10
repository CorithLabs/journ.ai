import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ItineraryView from '../ItineraryView';
import { db, type Plan } from '../../../db';
import { setViewport, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

const built: Plan = {
  id: 'p1', name: 'Percé', destination: 'Percé', country: 'Canada',
  startDate: '2025-08-01', endDate: '2025-08-03',
  createdAt: '', updatedAt: '', deleted: false,
  itinerary: [{
    dayIndex: 0, label: 'Day 1',
    activities: [{ id: 'a1', name: 'Rocher Percé', time: 'morning', locationName: '', notes: '', pinnedToTodo: false }],
  }],
};

const empty: Plan = { ...built, itinerary: [] };

const show = (plan: Plan) => render(<MemoryRouter><ItineraryView plan={plan} /></MemoryRouter>);
const toRegenerate = (plan: Plan) => {
  show(plan);
  fireEvent.click(screen.getByText(/Regenerate/));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
  setViewport(DESKTOP);
});
afterEach(() => vi.unstubAllGlobals());

/*
 * The trap: a plan built entirely by hand, then Regenerate, with no API key.
 * The screen could only produce an error, and the user's own itinerary was
 * behind it with no way back to it.
 */
describe('regenerating without a key', () => {
  it('offers the way back to the itinerary', () => {
    toRegenerate(built);
    expect(screen.getByTestId('cancel-generate-btn')).toBeInTheDocument();
  });

  it('actually returns, with the plan untouched', async () => {
    toRegenerate(built);
    fireEvent.click(screen.getByTestId('cancel-generate-btn'));
    await waitFor(() => expect(screen.getByTestId('itinerary-view')).toBeInTheDocument());
    expect(screen.getByText('Rocher Percé')).toBeInTheDocument();
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  // Said before the button rather than discovered by failing.
  it('says a key is missing up front, and where to add one', () => {
    toRegenerate(built);
    expect(screen.getByTestId('generate-needs-key')).toBeInTheDocument();
    expect(screen.getByTestId('generate-goto-settings')).toHaveAttribute('href', '/settings');
  });

  it('does not offer a button that could only fail', () => {
    toRegenerate(built);
    expect(screen.queryByTestId('start-generate-btn')).not.toBeInTheDocument();
  });

  it('says plainly that regenerating would replace what is there', () => {
    toRegenerate(built);
    expect(screen.getByTestId('generate-itinerary')).toHaveTextContent(/replaces the days currently in this plan/i);
  });
});

describe('a plan with no days yet', () => {
  // There is nothing behind this screen, so a Back button would go nowhere.
  it('has no way back, because there is nothing to go back to', () => {
    show(empty);
    expect(screen.getByTestId('generate-itinerary')).toBeInTheDocument();
    expect(screen.queryByTestId('cancel-generate-btn')).not.toBeInTheDocument();
  });
});

/*
 * "Build it myself" writes fresh empty days over the itinerary. On a plan the
 * user filled in by hand that is the whole trip gone, with no undo — and it
 * sat on the same screen they were already stuck on.
 */
describe('starting over by hand', () => {
  it('asks first, naming what is about to go', async () => {
    toRegenerate(built);
    fireEvent.click(screen.getByTestId('start-manual-btn'));
    expect(await screen.findByTestId('confirm-dialog')).toHaveTextContent(/clears the 1 activity/i);

    fireEvent.click(screen.getByTestId('confirm-cancel'));
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument());
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  it('goes ahead once agreed', async () => {
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);
    toRegenerate(built);
    fireEvent.click(screen.getByTestId('start-manual-btn'));
    fireEvent.click(await screen.findByTestId('confirm-accept'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
  });

  it('says what it will do, rather than "build it myself"', () => {
    toRegenerate(built);
    expect(screen.getByTestId('start-manual-btn')).toHaveTextContent('Start over by hand');
  });

  it('asks nothing when there is nothing to lose', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);
    show(empty);
    fireEvent.click(screen.getByTestId('start-manual-btn'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });
});
