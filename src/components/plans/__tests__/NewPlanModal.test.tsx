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
