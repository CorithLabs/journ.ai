import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '../../../test/render';
import { MemoryRouter } from 'react-router-dom';
import IntakeChat from '../IntakeChat';
import { db, type Plan, type TravelMode } from '../../../db';
import { autoGenerateTodos } from '../generateTodos';

vi.mock('../generateTodos', () => ({ autoGenerateTodos: vi.fn().mockResolvedValue([]) }));

const plan = (extra: Partial<Plan> = {}): Plan => ({
  id: 'p1', name: 'Toronto', destination: 'Toronto', country: 'Canada',
  startDate: '2025-07-14', endDate: '2025-07-18',
  createdAt: '', updatedAt: '', deleted: false, itinerary: [], ...extra,
});

async function sendAnswer(text: string) {
  const input = screen.getByTestId('intake-input');
  await act(async () => { fireEvent.change(input, { target: { value: text } }); });
  const form = input.closest('form');
  if (form) await act(async () => { fireEvent.submit(form); });
}

/** Walk the intake as far as the bookings question. */
const toBookings = async (p: Plan) => {
  render(<MemoryRouter><IntakeChat plan={p} /></MemoryRouter>);
  fireEvent.click(screen.getByTestId('intake-suggestion-2'));
  await screen.findByText(/Are any of the travellers children/i);
  fireEvent.click(screen.getByTestId('intake-suggestion-No'));
  await screen.findByText(/What kinds of activities/i);
  // The likes step's chips are activity values, so answer by typing.
  await sendAnswer('skip');
  await screen.findByText(/like to avoid/i);
  await sendAnswer('skip');
  await screen.findByText(/budget range/i);
  fireEvent.click(screen.getByText(/Mid-range/));
  await screen.findByText(/already booked your/i);
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(db.plans, 'update').mockResolvedValue(1);
});

describe('the bookings question follows the travel mode', () => {
  const asks = async (mode: TravelMode | undefined, pattern: RegExp) => {
    await toBookings(plan(mode ? { arrival: { mode } } : {}));
    expect(screen.getByText(pattern)).toBeInTheDocument();
  };

  it('names train tickets on a train trip', () => asks('train', /booked your train tickets/i));
  it('names flights on a flight', () => asks('flight', /booked your flights/i));

  /*
   * "Have you booked your flights?" has no answer on a road trip. It asks
   * about the only thing there is to book instead.
   */
  it('asks only about accommodation on a road trip', async () => {
    await asks('car', /booked your accommodation\?/i);
    expect(screen.queryByText(/flights|tickets/i)).not.toBeInTheDocument();
  });

  it('stays neutral when nobody has said how', () => asks(undefined, /booked your travel/i));

  it('offers chips worded to match', async () => {
    await toBookings(plan({ arrival: { mode: 'train' } }));
    expect(screen.getByText('Train tickets only')).toBeInTheDocument();
    expect(screen.queryByText('Flights only')).not.toBeInTheDocument();
  });

  it('reads an answer whatever noun its chip used', async () => {
    await toBookings(plan({ arrival: { mode: 'train' } }));
    fireEvent.click(screen.getByText('Train tickets only'));
    await screen.findByText(/visa/i);
    // 'No' also appears as the earlier kids answer, so target the chip.
    fireEvent.click(screen.getByTestId('intake-suggestion-No'));

    await vi.waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    const saved = vi.mocked(db.plans.update).mock.calls[0][1] as { intake: NonNullable<Plan['intake']> };
    expect(saved.intake.flightsBooked).toBe(true);
    expect(saved.intake.accommodationBooked).toBe(false);
  });
});

describe('a domestic trip is not asked about visas', () => {
  // The question itself was part of the assumption that every trip crosses a
  // border.
  it('finishes at the bookings answer', async () => {
    await toBookings(plan({ international: false, arrival: { mode: 'car' } }));
    fireEvent.click(screen.getByText('Booked'));

    await vi.waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(screen.queryByText(/visa/i)).not.toBeInTheDocument();
    const saved = vi.mocked(db.plans.update).mock.calls[0][1] as { intake: NonNullable<Plan['intake']> };
    expect(saved.intake.needsVisa).toBe(false);
  });

  it('still asks when the trip crosses a border', async () => {
    await toBookings(plan({ international: true }));
    fireEvent.click(screen.getByText('Neither'));
    expect(await screen.findByText(/visa to visit Canada/i)).toBeInTheDocument();
  });
});

describe('who decides what the trip needs', () => {
  /*
   * The intake used to build its own copies of the booking tasks so it could
   * name them in the chat, and the copies drifted: "Book flights" whatever the
   * mode, and a child-entry check against the city rather than the country.
   */
  it('hands the to-dos to the one place that knows the rules', async () => {
    vi.mocked(autoGenerateTodos).mockResolvedValue(['Book train tickets to Toronto']);
    await toBookings(plan({ international: true, arrival: { mode: 'train' } }));
    fireEvent.click(screen.getByText('Neither'));
    await screen.findByText(/visa/i);
    fireEvent.click(screen.getByText('Not sure'));

    await vi.waitFor(() => expect(autoGenerateTodos).toHaveBeenCalled());
    expect(await screen.findByText(/Book train tickets to Toronto/)).toBeInTheDocument();
  });
});
