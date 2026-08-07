import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GenerateItinerary from '../GenerateItinerary';
import { db, type Plan } from '../../../db';
import { autoGenerateTodos } from '../generateTodos';

// Spy on autoGenerateTodos so we can assert the plan it receives has a
// populated itinerary (Bug 2 regression guard).
vi.mock('../generateTodos', () => ({
  autoGenerateTodos: vi.fn().mockResolvedValue(undefined),
}));

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
  intake: {
    numTravellers: 2,
    kids: false,
    kidAges: null,
    likes: ['sushi', 'temples'],
    dislikes: ['crowds'],
    budgetRange: 'mid',
    flightsBooked: false,
    accommodationBooked: false,
  },
};

/**
 * Build a mock streaming fetch Response whose SSE body emits `content` as a
 * single delta chunk, matching the OpenAI chat.completions stream format.
 */
function mockStreamResponse(content: string): Response {
  const frame = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n` + 'data: [DONE]\n\n';
  const bytes = new TextEncoder().encode(frame);
  let sent = false;
  const reader = {
    read: () =>
      sent
        ? Promise.resolve({ done: true, value: undefined })
        : ((sent = true), Promise.resolve({ done: false, value: bytes })),
  };
  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader },
    json: () => Promise.resolve({}),
  } as unknown as Response;
}

/** Seed localStorage so getApiKey() decrypts successfully (crypto is mocked). */
function seedApiKey() {
  localStorage.setItem('aitp_api_key', JSON.stringify({ ciphertext: btoa('x'), iv: btoa('y') }));
  localStorage.setItem('aitp_device_salt', btoa('salt'));
}

const FENCED_JSON =
  '```json\n' +
  JSON.stringify({
    days: [
      {
        dayIndex: 0,
        label: 'Day 1 — Mon 14 Jul',
        estimatedDailySpend: { min: 80, max: 150, currency: 'USD' },
        activities: [
          { id: 'a-1', name: 'Tsukiji Outer Market', time: '08:00', locationName: 'Tsukiji, Tokyo', notes: 'Sushi breakfast', budgetWarning: false },
        ],
      },
    ],
  }) +
  '\n```\n';

describe('GenerateItinerary', () => {
  const onGenerated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders generate button', () => {
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    expect(screen.getByTestId('start-generate-btn')).toBeInTheDocument();
    expect(screen.getByText('Generate Itinerary')).toBeInTheDocument();
  });

  // A plan created before the 14-day cap shipped (or duplicated from one) can
  // still exceed it. Generating would blow the token budget and fail mid-JSON,
  // so the button is replaced by an explanation and no request is made.
  describe('trip exceeding the 14-day cap', () => {
    const longPlan: Plan = { ...mockPlan, startDate: '2025-07-01', endDate: '2025-07-21' };

    it('blocks generation and explains why, naming the actual span', () => {
      render(<MemoryRouter><GenerateItinerary plan={longPlan} onGenerated={onGenerated} /></MemoryRouter>);
      const warning = screen.getByTestId('trip-too-long-warning');
      expect(warning).toHaveTextContent(/21 days/);
      expect(warning).toHaveTextContent(/14-day maximum/);
      expect(screen.queryByTestId('start-generate-btn')).not.toBeInTheDocument();
    });

    it('makes no AI request for an over-length plan', () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      seedApiKey();
      render(<MemoryRouter><GenerateItinerary plan={longPlan} onGenerated={onGenerated} /></MemoryRouter>);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(onGenerated).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('still allows a trip of exactly 14 days', () => {
      const exactly14: Plan = { ...mockPlan, startDate: '2025-07-01', endDate: '2025-07-14' };
      render(<MemoryRouter><GenerateItinerary plan={exactly14} onGenerated={onGenerated} /></MemoryRouter>);
      expect(screen.getByTestId('start-generate-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('trip-too-long-warning')).not.toBeInTheDocument();
    });
  });

  it('shows destination name', () => {
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    expect(screen.getByText(/Tokyo/i)).toBeInTheDocument();
  });

  it('shows budget badge when intake has budget range', () => {
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    expect(screen.getByText(/Budget/i)).toBeInTheDocument();
  });

  it('shows error when no API key configured', async () => {
    // localStorage is cleared — no api key
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));
    await waitFor(() => {
      expect(screen.getByText(/No API key configured/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('parses a markdown-fenced AI response and saves the itinerary to IndexedDB (Bug 1)', async () => {
    seedApiKey();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockStreamResponse(FENCED_JSON));
    // db.plans.get resolves the freshly-written plan for autoGenerateTodos.
    vi.mocked(db.plans.get).mockResolvedValue({
      ...mockPlan,
      itinerary: [{ dayIndex: 0, label: 'Day 1 — Mon 14 Jul', activities: [] }],
    });

    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));

    await waitFor(() => {
      expect(db.plans.update).toHaveBeenCalledWith(
        'plan-1',
        expect.objectContaining({ itinerary: expect.arrayContaining([expect.objectContaining({ dayIndex: 0 })]) }),
      );
    });
    // Only ONE stream call — the fenced JSON parsed on the first pass, so the
    // repair prompt was never triggered.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onGenerated).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('passes a plan with a non-empty itinerary to autoGenerateTodos (Bug 2)', async () => {
    seedApiKey();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockStreamResponse(FENCED_JSON));
    const freshPlan = {
      ...mockPlan,
      itinerary: [
        { dayIndex: 0, label: 'Day 1 — Mon 14 Jul', activities: [{ id: 'a-1', name: 'Tsukiji Outer Market', time: '08:00', locationName: 'Tsukiji, Tokyo', notes: '', pinnedToTodo: false, budgetWarning: false }] },
      ],
    };
    vi.mocked(db.plans.get).mockResolvedValue(freshPlan);

    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));

    await waitFor(() => {
      expect(autoGenerateTodos).toHaveBeenCalledTimes(1);
    });
    const received = vi.mocked(autoGenerateTodos).mock.calls[0][0];
    expect(received.itinerary.length).toBeGreaterThan(0);
    fetchSpy.mockRestore();
  });

  it('skips autoGenerateTodos silently when the plan is missing after update (edge case)', async () => {
    seedApiKey();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockStreamResponse(FENCED_JSON));
    vi.mocked(db.plans.get).mockResolvedValue(undefined as unknown as Plan);

    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));

    await waitFor(() => {
      expect(db.plans.update).toHaveBeenCalled();
    });
    // Itinerary is still saved; autoGenerateTodos is not called on undefined plan.
    expect(autoGenerateTodos).not.toHaveBeenCalled();
    expect(onGenerated).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('parses an un-fenced AI response unchanged (fence stripping is a no-op)', async () => {
    seedApiKey();
    const plain = JSON.stringify({
      days: [{ dayIndex: 0, label: 'Day 1', estimatedDailySpend: { min: 50, max: 90, currency: 'USD' }, activities: [{ id: 'a-2', name: 'Ueno Park', time: '10:00', locationName: 'Ueno', notes: '', budgetWarning: false }] }],
    });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockStreamResponse(plain));
    vi.mocked(db.plans.get).mockResolvedValue({ ...mockPlan, itinerary: [{ dayIndex: 0, label: 'Day 1', activities: [] }] });

    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));

    await waitFor(() => {
      expect(db.plans.update).toHaveBeenCalled();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
