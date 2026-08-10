import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TripDetailsPanel from '../TripDetailsPanel';
import { db, type Plan } from '../../../db';

vi.mock('../../../services/destinations', async () => {
  const actual = await vi.importActual<typeof import('../../../services/destinations')>('../../../services/destinations');
  return {
    ...actual,
    searchDestinations: vi.fn(async () => [{ label: 'Gaspé, Canada', country: 'Canada' }]),
  };
});

const plan: Plan = {
  id: 'p1', name: 'Percé', destination: 'Percé', country: 'Canada',
  startDate: '2025-08-01', endDate: '2025-08-05',
  createdAt: '', updatedAt: '', deleted: false,
  arrival: { city: 'Montreal', mode: 'car' },
  stops: [{ id: 's1', city: 'Matane' }],
  itinerary: [{ dayIndex: 0, label: 'Day 1', activities: [] }],
};

const onClose = vi.fn();
const show = (p: Plan = plan) => render(<TripDetailsPanel plan={p} onClose={onClose} />);
const saved = () => vi.mocked(db.plans.update).mock.calls[0][1] as Partial<Plan>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(db.plans, 'update').mockResolvedValue(1);
});

/*
 * All of this was write-once. The only thing editable after creation was the
 * name, so a wrong route, a wrong date or a wrong travel mode meant deleting
 * the plan and starting over.
 */
describe('editing a trip that already exists', () => {
  it('opens with what the trip already says', () => {
    show();
    expect(screen.getByTestId('td-destination')).toHaveValue('Percé');
    expect(screen.getByTestId('td-start')).toHaveValue('2025-08-01');
    expect(screen.getByTestId('td-arrival-city')).toHaveValue('Montreal');
    expect(screen.getByTestId('stop-city-0')).toHaveValue('Matane');
  });

  it('saves a changed route', async () => {
    show();
    fireEvent.change(screen.getByTestId('stop-city-0'), { target: { value: 'Rimouski' } });
    fireEvent.click(screen.getByTestId('add-stop'));
    fireEvent.change(screen.getByTestId('stop-city-1'), { target: { value: 'Percé' } });
    fireEvent.click(screen.getByTestId('td-save'));

    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(saved().stops?.map(s => s.city)).toEqual(['Rimouski', 'Percé']);
  });

  it('saves a changed travel mode and dates', async () => {
    show();
    fireEvent.click(screen.getByTestId('td-arrival-mode-train'));
    fireEvent.change(screen.getByTestId('td-end'), { target: { value: '2025-08-07' } });
    fireEvent.click(screen.getByTestId('td-save'));

    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(saved().arrival?.mode).toBe('train');
    expect(saved().endDate).toBe('2025-08-07');
  });

  it('closes without writing anything on cancel', () => {
    show();
    fireEvent.change(screen.getByTestId('td-destination'), { target: { value: 'Somewhere else' } });
    fireEvent.click(screen.getByTestId('td-cancel'));
    expect(db.plans.update).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

/*
 * Renaming used to write straight to `destination`, which is what the map's
 * anchors and the visa to-do are built from — so it could silently repoint
 * both at a place that does not geocode, keeping the old country.
 */
describe('the country cannot go stale', () => {
  it('drops the old country when the destination is typed over', async () => {
    show();
    fireEvent.change(screen.getByTestId('td-destination'), { target: { value: 'Gaspésie road trip' } });
    fireEvent.click(screen.getByTestId('td-save'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(saved().country).toBeUndefined();
  });

  it('resolves a country again when a suggestion is picked', async () => {
    show();
    fireEvent.change(screen.getByTestId('td-destination'), { target: { value: 'Gasp' } });
    const option = await screen.findByTestId('td-destination-option-0');
    fireEvent.mouseDown(option);
    fireEvent.click(screen.getByTestId('td-save'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(saved()).toMatchObject({ destination: 'Gaspé, Canada', country: 'Canada' });
  });

  it('refuses a destination that is not one', () => {
    show();
    fireEvent.change(screen.getByTestId('td-destination'), { target: { value: '12345' } });
    fireEvent.click(screen.getByTestId('td-save'));
    expect(screen.getByTestId('td-error')).toBeInTheDocument();
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  it('refuses an end date before the start', () => {
    show();
    fireEvent.change(screen.getByTestId('td-end'), { target: { value: '2025-07-01' } });
    fireEvent.click(screen.getByTestId('td-save'));
    expect(screen.getByTestId('td-error')).toHaveTextContent(/after start date/i);
  });
});

// Silently deleting a day the user had filled in would be worse than a range
// that no longer lines up, so the days are left alone and the mismatch said.
describe('changing the dates of a plan that has days', () => {
  it('warns rather than rewriting the itinerary', async () => {
    show();
    fireEvent.change(screen.getByTestId('td-end'), { target: { value: '2025-08-09' } });
    expect(screen.getByTestId('td-dates-warning')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('td-save'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(saved().itinerary).toBeUndefined();
  });

  it('says nothing when the dates have not moved', () => {
    show();
    expect(screen.queryByTestId('td-dates-warning')).not.toBeInTheDocument();
  });
});
