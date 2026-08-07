import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IntakeChat from '../IntakeChat';
import { db, type Plan } from '../../../db';

const mockPlan: Plan = {
  id: 'plan-1',
  name: 'Tokyo',
  destination: 'Tokyo',
  startDate: '2025-07-14',
  endDate: '2025-07-20',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deleted: false,
  itinerary: [],
};

async function sendAnswer(text: string) {
  const input = screen.getByTestId('intake-input');
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
  });
  const form = input.closest('form');
  if (form) {
    await act(async () => { fireEvent.submit(form); });
  }
}

// ItineraryView already supports building a day by hand, but was only
// reachable through AI generation. Writing the scaffolded days is the route in.
// Visas are issued by countries, so the question names the country resolved
// at plan creation rather than the city.
describe('IntakeChat visa question', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(db.plans.update).mockResolvedValue(1);
  });

  const answerThrough = async (plan: Plan) => {
    render(<IntakeChat plan={plan} />);
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
    await screen.findByText(/booked your flights/i);
    fireEvent.click(screen.getByTestId('intake-suggestion-Both booked'));
  };

  it('names the country, not the city', async () => {
    await answerThrough({ ...mockPlan, destination: 'Toronto, Canada', country: 'Canada' });
    expect(await screen.findByText(/do you need a visa to visit Canada/i)).toBeInTheDocument();
  });

  it('asks generically when no country was resolved', async () => {
    await answerThrough({ ...mockPlan, country: undefined });
    expect(await screen.findByText(/do you need a visa for this trip/i)).toBeInTheDocument();
  });

  it('records a "no" so no visa task is created downstream', async () => {
    await answerThrough({ ...mockPlan, country: 'Japan' });
    await screen.findByText(/do you need a visa/i);
    fireEvent.click(screen.getByTestId('intake-suggestion-No'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    const [, patch] = vi.mocked(db.plans.update).mock.calls.at(-1)!;
    expect((patch as { intake: { needsVisa: boolean | null } }).intake.needsVisa).toBe(false);
  });

  it('records "Not sure" as null, which asks the user to check rather than apply', async () => {
    await answerThrough({ ...mockPlan, country: 'Japan' });
    await screen.findByText(/do you need a visa/i);
    fireEvent.click(screen.getByTestId('intake-suggestion-Not sure'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    const [, patch] = vi.mocked(db.plans.update).mock.calls.at(-1)!;
    expect((patch as { intake: { needsVisa: boolean | null } }).intake.needsVisa).toBeNull();
  });
});

describe('IntakeChat manual escape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(db.plans.update).mockResolvedValue(1);
  });

  it('leads with the manual path when no AI key is configured', () => {
    render(<IntakeChat plan={mockPlan} />);
    expect(screen.getByTestId('intake-no-key')).toBeInTheDocument();
    expect(screen.getByTestId('start-manual-btn')).toBeInTheDocument();
  });

  it('writes empty days spanning the trip, which routes on to the itinerary', async () => {
    render(<IntakeChat plan={mockPlan} />);
    fireEvent.click(screen.getByTestId('start-manual-btn'));
    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    const [, patch] = vi.mocked(db.plans.update).mock.calls.at(-1)!;
    // 14–20 July inclusive.
    expect((patch as { itinerary: unknown[] }).itinerary).toHaveLength(7);
  });

  it('still offers the manual path when a key exists, without the warning', () => {
    localStorage.setItem('aitp_api_key', JSON.stringify({ ciphertext: 'x', iv: 'y' }));
    render(<IntakeChat plan={mockPlan} />);
    expect(screen.queryByTestId('intake-no-key')).not.toBeInTheDocument();
    expect(screen.getByTestId('start-manual-btn')).toBeInTheDocument();
  });
});

describe('IntakeChat suggestions', () => {
  // Only budget had tappable answers; every other question was a bare text box.
  it('offers tappable answers for the opening question', () => {
    render(<IntakeChat plan={mockPlan} />);
    expect(screen.getByTestId('intake-suggestions')).toBeInTheDocument();
    expect(screen.getByTestId('intake-suggestion-2')).toBeInTheDocument();
  });

  it('answers immediately for a single-value question', async () => {
    render(<IntakeChat plan={mockPlan} />);
    fireEvent.click(screen.getByTestId('intake-suggestion-2'));
    // Advancing to the kids question proves the answer was accepted.
    await waitFor(() =>
      expect(screen.getByText(/Are any of the travellers children/i)).toBeInTheDocument(),
    );
  });

  it('accumulates into the input for a multi-value question instead of submitting', async () => {
    render(<IntakeChat plan={mockPlan} />);
    fireEvent.click(screen.getByTestId('intake-suggestion-2'));
    await screen.findByText(/Are any of the travellers children/i);
    fireEvent.click(screen.getByTestId('intake-suggestion-No'));

    const streetFood = await screen.findByTestId('intake-suggestion-street food');
    fireEvent.click(streetFood);
    fireEvent.click(screen.getByTestId('intake-suggestion-museums'));

    // Both chosen, still on the same question awaiting more.
    expect(screen.getByTestId('intake-input')).toHaveValue('street food, museums');
    expect(screen.getByTestId('intake-suggestions')).toBeInTheDocument();
  });

  it('does not add the same value twice', async () => {
    render(<IntakeChat plan={mockPlan} />);
    fireEvent.click(screen.getByTestId('intake-suggestion-2'));
    await screen.findByText(/Are any of the travellers children/i);
    fireEvent.click(screen.getByTestId('intake-suggestion-No'));
    const streetFood = await screen.findByTestId('intake-suggestion-street food');
    fireEvent.click(streetFood);
    fireEvent.click(streetFood);
    expect(screen.getByTestId('intake-input')).toHaveValue('street food');
  });
});

describe('IntakeChat', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the opening question about number of travellers', () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    expect(screen.getByText(/How many people are travelling/i)).toBeInTheDocument();
  });

  it('shows input field for answers', () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    expect(screen.getByTestId('intake-input')).toBeInTheDocument();
  });

  it('advances to kids question after entering traveller count', async () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    await sendAnswer('2');
    await waitFor(() => {
      expect(screen.getByText(/children/i)).toBeInTheDocument();
    });
  });

  it('shows budget quick-select buttons after answering likes and dislikes', async () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    // travellers
    await sendAnswer('2');
    await waitFor(() => expect(screen.getByText(/children/i)).toBeInTheDocument());
    // kids -> no
    await sendAnswer('no');
    // likes question: "What kinds of activities do you enjoy?"
    await waitFor(() => expect(screen.getByText(/activities do you enjoy/i)).toBeInTheDocument());
    await sendAnswer('hiking');
    // dislikes question
    await waitFor(() => expect(screen.getByText(/avoid/i)).toBeInTheDocument());
    await sendAnswer('skip');
    // budget buttons appear
    await waitFor(() => {
      expect(screen.getByText(/Budget.*\$100/i)).toBeInTheDocument();
    });
  });
});
