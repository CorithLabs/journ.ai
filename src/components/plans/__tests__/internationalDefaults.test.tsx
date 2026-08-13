import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NewPlanModal from '../NewPlanModal';
import { db } from '../../../db';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const fill = (destination = 'Tokyo, Japan', start = '2025-07-14', end = '2025-07-21') => {
  fireEvent.change(screen.getByTestId('destination-input'), { target: { value: destination } });
  fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: start } });
  fireEvent.change(screen.getByTestId('end-date-input'), { target: { value: end } });
};

const goInternational = () => fireEvent.click(screen.getByTestId('border-international'));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(db.plans.add).mockResolvedValue('new-plan-id');
  render(<MemoryRouter><NewPlanModal onClose={vi.fn()} /></MemoryRouter>);
});

/*
 * Saying a trip crosses a border answers most of the travel section by
 * implication — and all of it used to be typed by hand behind a section that
 * was collapsed by default.
 */
describe('choosing international', () => {
  it('fills in the flight, the airport and the dates', async () => {
    fill();
    goInternational();

    await waitFor(() => expect(screen.getByTestId('arrival-city')).toHaveValue('Tokyo'));
    expect(screen.getByTestId('arrival-airport')).toHaveValue('Narita International (NRT)');
    expect(screen.getByTestId('arrival-date')).toHaveValue('2025-07-14');
    expect(screen.getByTestId('departure-city')).toHaveValue('Tokyo');
    expect(screen.getByTestId('departure-date')).toHaveValue('2025-07-21');
  });

  /*
   * Opened, not filled in quietly. An international trip is not always a
   * flight — Copenhagen to Lund is a train across a border — so these have to
   * be seen to be corrected.
   */
  it('opens the section rather than answering it out of sight', async () => {
    fill();
    expect(screen.queryByTestId('arrival-city')).not.toBeInTheDocument();

    goInternational();

    await waitFor(() => expect(screen.getByTestId('arrival-city')).toBeInTheDocument());
  });

  it('lands you at the airport when the city has none of its own', async () => {
    fill('Kyoto, Japan');
    goInternational();

    await waitFor(() => expect(screen.getByTestId('arrival-city')).toHaveValue('Osaka'));
    expect(screen.getByTestId('arrival-airport')).toHaveValue('Kansai International (KIX)');
  });

  it('assumes nothing for a domestic trip', () => {
    fill();

    fireEvent.click(screen.getByTestId('border-domestic'));

    expect(screen.queryByTestId('arrival-city')).not.toBeInTheDocument();
  });

  it('leaves the airport blank for a city it knows none for', async () => {
    fill('Percé, Canada');
    goInternational();

    await waitFor(() => expect(screen.getByTestId('arrival-city')).toHaveValue('Percé'));
    expect(screen.getByTestId('arrival-airport')).toHaveValue('');
  });
});

/*
 * Trip type is often chosen before the dates are settled, and a leg still
 * carrying the old start date would be wrong in a way that is easy to miss.
 */
describe('when the trip dates change afterwards', () => {
  it('moves the legs to follow them', async () => {
    fill();
    goInternational();
    await waitFor(() => expect(screen.getByTestId('arrival-date')).toHaveValue('2025-07-14'));

    fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2025-07-16' } });

    await waitFor(() => expect(screen.getByTestId('arrival-date')).toHaveValue('2025-07-16'));
  });

  // An overnight flight leaving the day before the trip has to survive a
  // change to the dates: once it is edited it belongs to the traveller.
  it('leaves a date the traveller set themselves', async () => {
    fill();
    goInternational();
    await waitFor(() => expect(screen.getByTestId('arrival-date')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('arrival-date'), { target: { value: '2025-07-13' } });

    fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2025-07-16' } });

    await waitFor(() => expect(screen.getByTestId('start-date-input')).toHaveValue('2025-07-16'));
    expect(screen.getByTestId('arrival-date')).toHaveValue('2025-07-13');
  });
});
