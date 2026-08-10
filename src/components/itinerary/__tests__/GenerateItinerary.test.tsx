import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
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
    seedApiKey();
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
      seedApiKey();
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

  /*
   * This used to be discovered by clicking Generate and reading the failure.
   * On a regenerate that error was a dead end, with the user's own itinerary
   * behind it — so the missing key is now stated before the button, and the
   * button that could only fail is not offered at all.
   */
  it('says a key is missing before offering to generate', () => {
    // localStorage is cleared — no api key
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    expect(screen.getByTestId('generate-needs-key')).toBeInTheDocument();
    expect(screen.queryByTestId('start-generate-btn')).not.toBeInTheDocument();
  });

  it('shows retry button on error', async () => {
    seedApiKey();
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
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
const onGeneratedSpy = vi.fn();

/*
 * A real eight-day Kyoto/Osaka itinerary arrived with a day object closed
 * twice — `..."budgetWarning":true}]}},{"dayIndex":6` — and the whole trip was
 * rejected over one stray character. The old extractor matched greedily from
 * the first brace to the last, so the bad character came along with it.
 */
const DOUBLE_CLOSED_JSON =
  '{"days":[' +
  '{"dayIndex":0,"label":"Day 1","activities":[{"id":"x1","name":"Fushimi Inari","time":"09:00","locationName":"Kyoto","notes":"","budgetWarning":false}]}},' +
  '{"dayIndex":1,"label":"Day 2","activities":[{"id":"x2","name":"Himeji Castle","time":"09:00","locationName":"Himeji","notes":"","budgetWarning":false}]}},' +
  '{"dayIndex":2,"label":"Day 3","activities":[{"id":"x3","name":"Osaka Castle","time":"10:00","locationName":"Osaka","notes":"","budgetWarning":false}]}' +
  ']}';

describe('malformed model output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedApiKey();
  });

  it('salvages an itinerary whose day objects were closed twice', async () => {
    const update = vi.spyOn(db.plans, 'update').mockResolvedValue(1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockStreamResponse(DOUBLE_CLOSED_JSON)));

    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGeneratedSpy} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const written = update.mock.calls[0][1] as { itinerary: Plan['itinerary'] };
    // All three days, not the prefix that happened to parse.
    expect(written.itinerary).toHaveLength(3);
    expect(written.itinerary[2].activities[0].name).toBe('Osaka Castle');
  });

  // One request, not two: the local repair means the model is not asked to
  // fix output that was already recoverable.
  it('does not spend a second request repairing it', async () => {
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse(DOUBLE_CLOSED_JSON));
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGeneratedSpy} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));

    await waitFor(() => expect(db.plans.update).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the days it got when the response was cut off mid-activity', async () => {
    const update = vi.spyOn(db.plans, 'update').mockResolvedValue(1);
    const truncated =
      '{"days":[{"dayIndex":0,"label":"Day 1","activities":[' +
      '{"id":"x1","name":"Fushimi Inari","time":"09:00","locationName":"Kyoto","notes":"","budgetWarning":false},' +
      '{"id":"x2","name":"Nishiki Mark';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockStreamResponse(truncated)));

    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGeneratedSpy} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const written = update.mock.calls[0][1] as { itinerary: Plan['itinerary'] };
    expect(written.itinerary[0].activities[0].name).toBe('Fushimi Inari');
  });

  // OpenAI rejects the request unless "JSON" appears in the messages; the
  // itinerary prompt says it throughout.
  it('asks OpenAI to guarantee valid JSON', async () => {
    vi.spyOn(db.plans, 'update').mockResolvedValue(1);
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse(DOUBLE_CLOSED_JSON));
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGeneratedSpy} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body.messages)).toContain('JSON');
  });
});
