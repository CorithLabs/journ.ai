import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import { useLiveQuery } from 'dexie-react-hooks';
import AgentPanel from '../AgentPanel';
import { useAppStore } from '../../../store';
import * as aiKey from '../../../services/aiKey';
import { chatWithTools } from '../../../services/aiClient';
import type { Activity, Plan } from '../../../db';

vi.mock('dexie-react-hooks');
vi.mock('../../../services/aiKey');
vi.mock('../../../services/aiClient');

const act = (name: string, time: string): Activity => ({
  id: name, name, time, locationName: '', notes: '', pinnedToTodo: false,
});

const plan: Plan = {
  id: 'plan-1', name: 'Calgary', destination: 'Calgary', country: 'Canada',
  startDate: '2025-08-01', endDate: '2025-08-03',
  createdAt: '', updatedAt: '', deleted: false,
  // The Calgary case: an arrival at 09:00 and nothing until 19:00.
  itinerary: [
    { dayIndex: 0, label: 'Day 1', activities: [act('Arrival', 'morning'), act('Stephen Avenue', 'evening')] },
    { dayIndex: 1, label: 'Day 2', activities: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiKey.hasStoredKey).mockReturnValue(true);
  vi.mocked(aiKey.getApiKey).mockResolvedValue('sk-test');
  vi.mocked(useLiveQuery).mockImplementation((querier) =>
    (String(querier).includes('todos') ? [] : plan) as never);
  useAppStore.setState({
    agentPanelOpen: true,
    agentMessages: [],
    activeTab: 'itinerary',
    activePlanId: 'plan-1',
    offlineBannerVisible: false,
  });
});

/*
 * A chat with an empty composer asks the traveller to invent the request, and
 * "what can this thing do" is a worse first question than any of the answers.
 */
describe('before anything has been said', () => {
  it('offers what is worth doing on this trip', () => {
    render(<AgentPanel planId="plan-1" />);

    const pills = screen.getByTestId('agent-suggestions');
    expect(pills).toHaveTextContent('Fill the gap on day 1');
    expect(pills).toHaveTextContent('Plan day 2');
  });

  it('sends a pill as though it had been typed', async () => {
    vi.mocked(chatWithTools).mockResolvedValue({ text: 'Done.', toolCalls: [] });
    render(<AgentPanel planId="plan-1" />);

    fireEvent.click(screen.getByTestId('agent-suggestion-0'));

    await waitFor(() =>
      expect(screen.getByTestId('agent-msg-user')).toHaveTextContent('Fill the gap on day 1'));
  });
});

describe('after a reply', () => {
  const replyWith = (text: string) =>
    vi.mocked(chatWithTools).mockResolvedValue({ text, toolCalls: [] });

  const sendSomething = async () => {
    fireEvent.change(screen.getByTestId('agent-input'), { target: { value: 'plan day 2' } });
    fireEvent.click(screen.getByTestId('agent-send'));
  };

  it('offers what the assistant proposed, and not its marker', async () => {
    replyWith("Added three stops.\n[[suggest: Add lunch on day 2 | Move the museum]]");
    render(<AgentPanel planId="plan-1" />);

    await sendSomething();

    await waitFor(() =>
      expect(screen.getByTestId('agent-msg-assistant')).toHaveTextContent('Added three stops.'));
    expect(screen.getByTestId('agent-msg-assistant')).not.toHaveTextContent('[[suggest');
    expect(screen.getByTestId('agent-suggestion-0')).toHaveTextContent('Add lunch on day 2');
    expect(screen.getByTestId('agent-suggestion-1')).toHaveTextContent('Move the museum');
  });

  it('offers nothing when the assistant proposed nothing', async () => {
    replyWith('Day 2 is already full.');
    render(<AgentPanel planId="plan-1" />);

    await sendSomething();

    await waitFor(() =>
      expect(screen.getByTestId('agent-msg-assistant')).toBeInTheDocument());
    expect(screen.queryByTestId('agent-suggestions')).not.toBeInTheDocument();
  });

  /*
   * An older turn's follow-ups are answers to a question that has already
   * moved on, and a thread of stale pills is a thread of wrong offers.
   */
  it('keeps them on the newest reply only', async () => {
    replyWith('First.\n[[suggest: One]]');
    render(<AgentPanel planId="plan-1" />);
    await sendSomething();
    await waitFor(() => expect(screen.getByTestId('agent-suggestion-0')).toHaveTextContent('One'));

    replyWith('Second.\n[[suggest: Two]]');
    await sendSomething();

    await waitFor(() =>
      expect(screen.getByTestId('agent-suggestion-0')).toHaveTextContent('Two'));
    expect(screen.getAllByTestId('agent-suggestions')).toHaveLength(1);
  });
});
