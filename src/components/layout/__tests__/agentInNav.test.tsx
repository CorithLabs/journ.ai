import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TabBar from '../TabBar';
import AgentButton from '../../agent/AgentButton';
import { useAppStore } from '../../../store';
import { setViewport, PHONE, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue(undefined);
  useAppStore.setState({ agentPanelOpen: false });
});
afterEach(() => vi.unstubAllGlobals());

describe('agent trigger placement', () => {
  it('lives in the bottom bar on a phone', () => {
    setViewport(PHONE);
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(screen.getByTestId('agent-tab-btn')).toBeInTheDocument();
  });

  // It opens a panel; it is not a fifth tab. Inside the tablist it would break
  // tab semantics and arrow-key navigation.
  it('sits outside the tablist', () => {
    setViewport(PHONE);
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(screen.getByRole('tablist')).not.toContainElement(screen.getByTestId('agent-tab-btn'));
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('toggles the panel', () => {
    setViewport(PHONE);
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('agent-tab-btn'));
    expect(useAppStore.getState().agentPanelOpen).toBe(true);
  });

  // Two controls for the same thing, one floating on top of the other.
  it('drops the floating button on a phone', () => {
    setViewport(PHONE);
    render(<MemoryRouter><AgentButton /></MemoryRouter>);
    expect(screen.queryByTestId('agent-fab')).not.toBeInTheDocument();
  });

  /*
   * On a desktop it used to float in the bottom-right corner of every tab,
   * on top of the map's recentre button and the side panel. It now sits at
   * the end of the top bar, where it covers nothing.
   */
  it('sits at the end of the top bar on a desktop, not floating over the page', () => {
    setViewport(DESKTOP);
    vi.mocked(useLiveQuery).mockReturnValue({ itinerary: [{ dayIndex: 0, label: 'Day 1', activities: [] }] });
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    const button = screen.getByTestId('agent-fab');
    expect(screen.getByTestId('tab-bar')).toContainElement(button);
    expect(screen.getByRole('tablist')).not.toContainElement(button);
    expect(button.className).not.toMatch(/\bfixed\b/);
    expect(screen.queryByTestId('agent-tab-btn')).not.toBeInTheDocument();
  });

  // Two chats at once is one too many.
  it('is held back while the intake chat is on screen', () => {
    setViewport(DESKTOP);
    vi.mocked(useLiveQuery).mockReturnValue({ itinerary: [] });
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(screen.queryByTestId('agent-fab')).not.toBeInTheDocument();
  });
});
