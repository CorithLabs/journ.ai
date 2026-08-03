import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import AgentButton from '../AgentButton';
import AgentPanel from '../AgentPanel';
import { useAppStore } from '../../../store';
import * as aiKey from '../../../services/aiKey';

vi.mock('dexie-react-hooks');
vi.mock('../../../services/aiKey', () => ({
  hasStoredKey: vi.fn().mockReturnValue(true),
  getApiKey: vi.fn().mockResolvedValue('sk-test'),
}));

const plan = {
  id: 'plan-1',
  destination: 'Kyoto',
  name: 'Kyoto',
  startDate: '2025-07-14',
  endDate: '2025-07-16',
  createdAt: '',
  updatedAt: '',
  deleted: false,
  itinerary: [],
};

function resetStore() {
  useAppStore.setState({
    agentPanelOpen: false,
    agentMessages: [],
    activeTab: 'itinerary',
    activePlanId: 'plan-1',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiKey.hasStoredKey).mockReturnValue(true);
  vi.mocked(useLiveQuery).mockReturnValue(plan);
  resetStore();
});

function renderAgent() {
  return render(
    <MemoryRouter>
      <AgentButton />
      <AgentPanel planId="plan-1" />
    </MemoryRouter>,
  );
}

describe('AI agent panel', () => {
  it('shows the floating AI button and hides the panel initially', () => {
    renderAgent();
    expect(screen.getByTestId('agent-fab')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
  });

  it('opens the panel when the AI button is clicked', async () => {
    renderAgent();
    fireEvent.click(screen.getByTestId('agent-fab'));
    await waitFor(() => {
      expect(screen.getByTestId('agent-panel')).toBeInTheDocument();
    });
  });

  it('shows plan + active tab context in the header', async () => {
    renderAgent();
    fireEvent.click(screen.getByTestId('agent-fab'));
    await waitFor(() => {
      expect(screen.getByTestId('agent-context')).toHaveTextContent('Kyoto');
      expect(screen.getByTestId('agent-context')).toHaveTextContent('Itinerary');
    });
  });

  it('closes the panel with the X button', async () => {
    renderAgent();
    fireEvent.click(screen.getByTestId('agent-fab'));
    await screen.findByTestId('agent-panel');
    fireEvent.click(screen.getByTestId('agent-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    });
  });

  it('closes the panel when Escape is pressed', async () => {
    renderAgent();
    fireEvent.click(screen.getByTestId('agent-fab'));
    await screen.findByTestId('agent-panel');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    });
  });

  it('shows a degraded banner and disables input when no key is configured', async () => {
    vi.mocked(aiKey.hasStoredKey).mockReturnValue(false);
    renderAgent();
    fireEvent.click(screen.getByTestId('agent-fab'));
    await waitFor(() => {
      expect(screen.getByTestId('agent-no-key-banner')).toBeInTheDocument();
      expect(screen.getByTestId('agent-input')).toBeDisabled();
    });
  });

  it('preserves conversation history across panel close/reopen (session store)', async () => {
    renderAgent();
    // Seed a message directly in the session store
    useAppStore.setState({
      agentMessages: [{ id: 'm1', role: 'user', content: 'Hello agent', timestamp: 1 }],
    });
    fireEvent.click(screen.getByTestId('agent-fab'));
    await waitFor(() => {
      expect(screen.getByText('Hello agent')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('agent-close'));
    fireEvent.click(screen.getByTestId('agent-fab'));
    await waitFor(() => {
      expect(screen.getByText('Hello agent')).toBeInTheDocument();
    });
  });
});
