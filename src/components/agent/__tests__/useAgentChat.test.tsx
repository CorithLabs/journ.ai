import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import AgentPanel from '../AgentPanel';
import { useAppStore } from '../../../store';
import { db } from '../../../db';
import * as aiKey from '../../../services/aiKey';
import * as aiClient from '../../../services/aiClient';

vi.mock('dexie-react-hooks');
vi.mock('../../../services/aiKey', () => ({
  hasStoredKey: vi.fn().mockReturnValue(true),
  getApiKey: vi.fn().mockResolvedValue('sk-test'),
  OPENAI_KEY_STORAGE: 'aitp_api_key',
  ANTHROPIC_KEY_STORAGE: 'aitp_anthropic_key',
}));

// Mock chatWithTools at the aiClient level — this is the canonical boundary
// for the agent. Each test overrides the resolved value.
vi.mock('../../../services/aiClient', async (importActual) => {
  const actual = await importActual<typeof import('../../../services/aiClient')>();
  return {
    ...actual,
    chatWithTools: vi.fn(),
    MissingKeyError: actual.MissingKeyError,
  };
});

const plan = {
  id: 'plan-1',
  name: 'Tokyo',
  destination: 'Tokyo',
  startDate: '2025-07-14',
  endDate: '2025-07-16',
  createdAt: '',
  updatedAt: '',
  deleted: false,
  itinerary: [{ dayIndex: 2, label: 'Day 3', activities: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiKey.hasStoredKey).mockReturnValue(true);
  vi.mocked(aiKey.getApiKey).mockResolvedValue('sk-test');
  /*
   * The panel runs two live queries — the plan, and the to-dos the opening
   * suggestions are drawn from. Returning the plan for both handed an object
   * where an array was expected, so the mock answers by what the querier
   * asked for rather than returning one value to everything.
   */
  vi.mocked(useLiveQuery).mockImplementation((querier) => {
    const source = String(querier);
    return (source.includes('todos') ? [] : plan) as never;
  });
  useAppStore.setState({
    agentPanelOpen: true,
    agentMessages: [],
    activeTab: 'itinerary',
    activePlanId: 'plan-1',
    offlineBannerVisible: false,
  });
});

function renderPanel() {
  render(
    <MemoryRouter>
      <AgentPanel planId="plan-1" />
    </MemoryRouter>,
  );
}

/**
 * Script the model turn by turn. The agent loop calls chatWithTools once per
 * round, so a bare mockResolvedValue would make the model re-request the same
 * tool every round — a pathological case, not the flow under test. Each entry
 * here is one round; the last should have no tool calls so the loop ends.
 */
function scriptModel(...rounds: { text?: string; toolCalls?: aiClient.ToolCall[] }[]) {
  const mock = vi.mocked(aiClient.chatWithTools);
  mock.mockReset();
  for (const r of rounds) {
    mock.mockResolvedValueOnce({ text: r.text ?? '', toolCalls: r.toolCalls ?? [] });
  }
  // Anything beyond the script ends the turn rather than looping forever.
  mock.mockResolvedValue({ text: '', toolCalls: [] });
  return mock;
}

describe('AI agent chat — actions', () => {
  it('executes an add_activity tool call and confirms', async () => {
    scriptModel({
      toolCalls: [
        { id: 'c1', name: 'add_activity', args: { dayIndex: 2, name: 'Tsukiji Fish Market', time: '08:00' } },
      ],
    });
    vi.mocked(db.plans.update).mockResolvedValue(1);
    renderPanel();

    fireEvent.change(screen.getByTestId('agent-input'), {
      target: { value: 'Add a sushi spot to Day 3' },
    });
    fireEvent.click(screen.getByTestId('agent-send'));

    await waitFor(() => {
      expect(screen.getByText(/added Tsukiji Fish Market to Day 3/i)).toBeInTheDocument();
    });
    // Applied exactly once — not once per round of the loop.
    expect(db.plans.update).toHaveBeenCalledTimes(1);
  });

  // Every itinerary tool writes the whole `itinerary` array. Running two of
  // them against one stale snapshot made the second discard the first's write,
  // so "add X and Y" silently landed only Y. The loop re-reads between calls.
  it('applies two itinerary tool calls in one turn without clobbering the first', async () => {
    scriptModel({
      toolCalls: [
        { id: 'c1', name: 'add_activity', args: { dayIndex: 2, name: 'Ramen Alley', time: '12:00' } },
        { id: 'c2', name: 'add_activity', args: { dayIndex: 2, name: 'Golden Gai', time: '20:00' } },
      ],
    });
    vi.mocked(db.plans.update).mockResolvedValue(1);
    // Re-read after the first write returns the plan WITH the first activity,
    // which is what the second call must build on.
    vi.mocked(db.plans.get).mockResolvedValue({
      ...plan,
      itinerary: [
        {
          dayIndex: 2,
          label: 'Day 3',
          activities: [
            { id: 'a1', name: 'Ramen Alley', time: '12:00', locationName: '', notes: '', pinnedToTodo: false },
          ],
        },
      ],
    });
    renderPanel();

    fireEvent.change(screen.getByTestId('agent-input'), {
      target: { value: 'Add Ramen Alley and Golden Gai to Day 3' },
    });
    fireEvent.click(screen.getByTestId('agent-send'));

    await waitFor(() => expect(db.plans.update).toHaveBeenCalledTimes(2));
    const second = vi.mocked(db.plans.update).mock.calls[1][1] as {
      itinerary: { activities: { name: string }[] }[];
    };
    const names = second.itinerary[0].activities.map((a) => a.name);
    expect(names).toEqual(['Ramen Alley', 'Golden Gai']);
  });

  // The point of the feedback loop: a read tool's data goes back to the model,
  // which then answers in prose. The user never sees the raw JSON.
  it('feeds a read tool result back and shows the model\'s answer, not the data', async () => {
    scriptModel(
      { toolCalls: [{ id: 'c1', name: 'read_clipboard_item', args: { titleMatch: 'hotel' } }] },
      { text: 'Your confirmation number is TK-2025-88421.' },
    );
    vi.mocked(db.clipboard.where).mockReturnValue({
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([
        { id: 'c1', planId: 'plan-1', type: 'Hotel', title: 'Hotel — Shinjuku Grand', body: 'Confirmation: TK-2025-88421' },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    renderPanel();
    fireEvent.change(screen.getByTestId('agent-input'), {
      target: { value: "what's my hotel confirmation number?" },
    });
    fireEvent.click(screen.getByTestId('agent-send'));

    await waitFor(() => {
      expect(screen.getByText(/TK-2025-88421/)).toBeInTheDocument();
    });
    // The second call carries the tool result keyed to the original call id.
    const secondCall = vi.mocked(aiClient.chatWithTools).mock.calls[1][0];
    const toolMsg = secondCall.find((m) => m.role === 'tool');
    expect(toolMsg).toMatchObject({ toolCallId: 'c1' });
    expect(toolMsg!.content).toMatch(/TK-2025-88421/);
    // No raw JSON bubble, and no write.
    expect(screen.queryByText(/"body":/)).not.toBeInTheDocument();
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  it('replays the assistant turn with its tool calls so results can be paired', async () => {
    scriptModel(
      { text: 'Let me check.', toolCalls: [{ id: 'c1', name: 'find_activities', args: {} }] },
      { text: 'You have nothing booked yet.' },
    );
    renderPanel();
    fireEvent.change(screen.getByTestId('agent-input'), { target: { value: 'what is on day 3?' } });
    fireEvent.click(screen.getByTestId('agent-send'));

    await waitFor(() => expect(aiClient.chatWithTools).toHaveBeenCalledTimes(2));
    const secondCall = vi.mocked(aiClient.chatWithTools).mock.calls[1][0];
    const assistantTurn = secondCall.find((m) => m.role === 'assistant' && 'toolCalls' in m);
    expect(assistantTurn).toMatchObject({
      role: 'assistant',
      toolCalls: [expect.objectContaining({ id: 'c1', name: 'find_activities' })],
    });
  });

  // A model that ignores the result and re-requests the same write would apply
  // it once per round — four identical activities instead of one.
  it('does not re-apply an identical tool call repeated across rounds', async () => {
    vi.mocked(aiClient.chatWithTools).mockResolvedValue({
      text: '',
      toolCalls: [{ id: 'c1', name: 'add_activity', args: { dayIndex: 2, name: 'Ramen Alley' } }],
    });
    vi.mocked(db.plans.update).mockResolvedValue(1);
    vi.mocked(db.plans.get).mockResolvedValue(plan);
    renderPanel();
    fireEvent.change(screen.getByTestId('agent-input'), { target: { value: 'add ramen' } });
    fireEvent.click(screen.getByTestId('agent-send'));

    // The loop is bounded — it stops asking rather than running forever.
    await waitFor(() => expect(aiClient.chatWithTools).toHaveBeenCalledTimes(4));
    // Let any further round start, if the cap were not holding.
    await new Promise((r) => setTimeout(r, 100));
    expect(vi.mocked(aiClient.chatWithTools).mock.calls.length).toBe(4);
    // Executed once despite being requested in all four rounds.
    expect(db.plans.update).toHaveBeenCalledTimes(1);
  });

  it('shows a clarifying question when the model returns no tool call', async () => {
    scriptModel({ text: 'Which evening did you mean — Day 1 or Day 2?' });
    renderPanel();
    fireEvent.change(screen.getByTestId('agent-input'), {
      target: { value: 'add something for tonight' },
    });
    fireEvent.click(screen.getByTestId('agent-send'));
    await waitFor(() => {
      expect(screen.getByText(/Which evening did you mean/i)).toBeInTheDocument();
    });
    expect(db.plans.update).not.toHaveBeenCalled();
  });

  it('handles malformed tool arguments gracefully', async () => {
    scriptModel({
      toolCalls: [{ id: 'c1', name: 'add_activity', args: {}, malformed: true }],
    });
    renderPanel();
    fireEvent.change(screen.getByTestId('agent-input'), { target: { value: 'do a thing' } });
    fireEvent.click(screen.getByTestId('agent-send'));
    await waitFor(() => {
      expect(screen.getByText(/couldn't complete that action/i)).toBeInTheDocument();
    });
  });

  it('logs the user message to the session conversation', async () => {
    scriptModel({ text: 'ok' });
    renderPanel();
    fireEvent.change(screen.getByTestId('agent-input'), { target: { value: 'Hello there' } });
    fireEvent.click(screen.getByTestId('agent-send'));
    await waitFor(() => {
      expect(screen.getByText('Hello there')).toBeInTheDocument();
    });
    const msgs = useAppStore.getState().agentMessages;
    expect(msgs.some((m) => m.role === 'user' && m.content === 'Hello there')).toBe(true);
  });
});
