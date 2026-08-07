import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NewPlanModal from '../NewPlanModal';
import { db } from '../../../db';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('NewPlanModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.plans.add).mockResolvedValue('new-plan-id');
  });

  const renderModal = () =>
    render(
      <MemoryRouter>
        <NewPlanModal onClose={onClose} />
      </MemoryRouter>,
    );

  // "12345" used to be accepted as a city, producing a nonsense itinerary
  // prompt and an unmappable plan.
  describe('destination validation', () => {
    it.each(['12345', '!!!', '7'])('rejects %s and creates no plan', async (value) => {
      renderModal();
      fireEvent.change(screen.getByTestId('destination-input'), { target: { value } });
      fireEvent.click(screen.getByTestId('create-plan-btn'));
      await waitFor(() =>
        expect(screen.getByText(/Enter a place name/i)).toBeInTheDocument(),
      );
      expect(db.plans.add).not.toHaveBeenCalled();
    });

    it('accepts a real place name', async () => {
      renderModal();
      fireEvent.change(screen.getByTestId('destination-input'), { target: { value: 'Tokyo' } });
      fireEvent.click(screen.getByTestId('create-plan-btn'));
      await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
    });
  });

  describe('destination suggestions', () => {
    it('offers matches while typing and stores the country when one is picked', async () => {
      renderModal();
      fireEvent.change(screen.getByTestId('destination-input'), { target: { value: 'toro' } });

      const option = await screen.findByTestId('destination-option-0', undefined, {
        timeout: 2000,
      });
      expect(option).toHaveTextContent('Toronto, Canada');

      fireEvent.mouseDown(option);
      expect(screen.getByTestId('destination-input')).toHaveValue('Toronto, Canada');

      fireEvent.click(screen.getByTestId('create-plan-btn'));
      // The country is what makes the visa to-do correct for Toronto.
      await waitFor(() =>
        expect(db.plans.add).toHaveBeenCalledWith(
          expect.objectContaining({ destination: 'Toronto, Canada', country: 'Canada' }),
        ),
      );
    });

    it('drops a previously picked country once the field is edited by hand', async () => {
      renderModal();
      const input = screen.getByTestId('destination-input');
      fireEvent.change(input, { target: { value: 'toro' } });
      fireEvent.mouseDown(await screen.findByTestId('destination-option-0', undefined, { timeout: 2000 }));
      // Typing something else must not leave "Canada" attached to it.
      fireEvent.change(input, { target: { value: 'Kyoto' } });
      fireEvent.click(screen.getByTestId('create-plan-btn'));
      await waitFor(() => expect(db.plans.add).toHaveBeenCalled());
      expect(vi.mocked(db.plans.add).mock.calls[0][0]).not.toHaveProperty('country');
    });

    it('shows no dropdown for a single character', async () => {
      renderModal();
      fireEvent.change(screen.getByTestId('destination-input'), { target: { value: 't' } });
      await new Promise((r) => setTimeout(r, 400));
      expect(screen.queryByTestId('destination-suggestions')).not.toBeInTheDocument();
    });
  });

  // The cap was only reported after submitting; the picker now enforces it.
  describe('date range constraints', () => {
    it('caps the end-date picker 13 days after the start, inclusive of both ends', () => {
      renderModal();
      fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2025-07-01' } });
      const end = screen.getByTestId('end-date-input');
      expect(end).toHaveAttribute('max', '2025-07-14');
      expect(end).toHaveAttribute('min', '2025-07-01');
    });

    it('leaves the picker unconstrained until a start date is chosen', () => {
      renderModal();
      expect(screen.getByTestId('end-date-input')).not.toHaveAttribute('max');
    });
  });

  it('renders form fields', () => {
    render(
      <MemoryRouter>
        <NewPlanModal onClose={onClose} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('destination-input')).toBeInTheDocument();
    expect(screen.getByTestId('start-date-input')).toBeInTheDocument();
    expect(screen.getByTestId('end-date-input')).toBeInTheDocument();
    expect(screen.getByTestId('create-plan-btn')).toBeInTheDocument();
  });

  it('shows validation error when destination is empty', async () => {
    render(
      <MemoryRouter>
        <NewPlanModal onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Destination is required');
    });
  });

  it('shows error when end date is before start date', async () => {
    render(
      <MemoryRouter>
        <NewPlanModal onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByTestId('destination-input'), { target: { value: 'Tokyo' } });
    fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2025-03-20' } });
    fireEvent.change(screen.getByTestId('end-date-input'), { target: { value: '2025-03-14' } });
    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('End date must be after start date');
    });
  });

  it('creates plan and navigates on valid submission', async () => {
    render(
      <MemoryRouter>
        <NewPlanModal onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByTestId('destination-input'), { target: { value: 'Tokyo' } });
    fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2025-03-14' } });
    fireEvent.change(screen.getByTestId('end-date-input'), { target: { value: '2025-03-20' } });
    fireEvent.click(screen.getByTestId('create-plan-btn'));
    await waitFor(() => {
      expect(db.plans.add).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'Tokyo',
          startDate: '2025-03-14',
          endDate: '2025-03-20',
          deleted: false,
          itinerary: [],
        }),
      );
    });
  });
});
