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
  vi.mocked(useLiveQuery).mockReturnValue(plan);
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

describe('AI agent chat — actions', () => {
  it('executes an add_activity tool call and confirms', async () => {
    vi.mocked(aiClient.chatWithTools).mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'add_activity', args: { dayIndex: 2, name: 'Tsukiji Fish Market', time: '08:00' } }],
    });
    vi.mocked(db.plans.update).mockResolvedValue(1);
    renderPanel();

    fireEvent.change(screen.getByTestId('agent-input'), {
      target: { value: 'Add a sushi spot to Day 3' },
    });
    fireEvent.click(screen.getByTestId('agent-send'));

    await waitFor(() => {
      expect(db.plans.update).toHaveBeenCalled();
      expect(screen.getByText(/added Tsukiji Fish Market to Day 3/i)).toBeInTheDocument();
    });
  });

  it('shows a clarifying question when the model returns no tool call', async () => {
    vi.mocked(aiClient.chatWithTools).mockResolvedValue({
      text: 'Which evening did you mean — Day 1 or Day 2?',
      toolCalls: [],
    });
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
    vi.mocked(aiClient.chatWithTools).mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'add_activity', args: {}, malformed: true }],
    });
    renderPanel();
    fireEvent.change(screen.getByTestId('agent-input'), { target: { value: 'do a thing' } });
    fireEvent.click(screen.getByTestId('agent-send'));
    await waitFor(() => {
      expect(screen.getByText(/couldn't complete that action/i)).toBeInTheDocument();
    });
  });

  it('logs the user message to the session conversation', async () => {
    vi.mocked(aiClient.chatWithTools).mockResolvedValue({ text: 'ok', toolCalls: [] });
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
