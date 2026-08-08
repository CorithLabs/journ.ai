import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Onboarding from '../Onboarding';
import AppShell from '../../layout/AppShell';
import { ONBOARDED_STORAGE, hasOnboarded, requestOnboarding } from '../../../services/onboarding';
import { setApiKey, ANTHROPIC_KEY_STORAGE } from '../../../services/aiKey';
import { getActiveProvider } from '../../../services/aiClient';

vi.mock('../../../services/aiKey', async () => {
  const actual = await vi.importActual<typeof import('../../../services/aiKey')>('../../../services/aiKey');
  return { ...actual, setApiKey: vi.fn().mockResolvedValue(undefined) };
});
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => [] }));

const onClose = vi.fn();
const show = () => render(<MemoryRouter><Onboarding onClose={onClose} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('first run', () => {
  it('opens when the introduction has not been seen', () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByTestId('onboarding')).toBeInTheDocument();
  });

  it('stays out of the way once it has', () => {
    localStorage.setItem(ONBOARDED_STORAGE, '1');
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument();
  });

  // Settings clears the flag, but the shell reads it once on mount — without
  // the event nothing would reopen until a reload.
  it('can be asked for again from elsewhere', () => {
    localStorage.setItem(ONBOARDED_STORAGE, '1');
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    act(() => requestOnboarding());
    expect(screen.getByTestId('onboarding')).toBeInTheDocument();
  });

  it('is remembered even when skipped at the first screen', () => {
    show();
    fireEvent.click(screen.getByTestId('onboarding-skip'));
    expect(hasOnboarded()).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  // An introduction, not a gate.
  it('closes on Escape', () => {
    show();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(hasOnboarded()).toBe(true);
  });
});

describe('the optional keys', () => {
  const toKeyStep = () => {
    show();
    fireEvent.click(screen.getByTestId('onboarding-next'));
  };

  /*
   * The manual path is finished and real, so it is offered as a choice. Anyone
   * who meets a wall of key fields with no way past assumes the app does not
   * work without them.
   */
  it('lets both keys be skipped outright', () => {
    toKeyStep();
    fireEvent.click(screen.getByTestId('onboarding-skip-ai'));
    fireEvent.click(screen.getByTestId('onboarding-skip-map'));
    expect(screen.getByTestId('onboarding-ready')).toBeInTheDocument();
  });

  it('rejects a key that is not the shape the provider issues', () => {
    toKeyStep();
    fireEvent.change(screen.getByTestId('onboarding-key-input'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByTestId('onboarding-save-key'));
    expect(screen.getByTestId('onboarding-key-error')).toHaveTextContent('sk-');
    expect(setApiKey).not.toHaveBeenCalled();
  });

  it('saves a key against the provider that was picked', async () => {
    toKeyStep();
    fireEvent.click(screen.getByTestId('onboarding-provider-anthropic'));
    fireEvent.change(screen.getByTestId('onboarding-key-input'), { target: { value: 'sk-ant-abc123' } });
    fireEvent.click(screen.getByTestId('onboarding-save-key'));

    await waitFor(() => expect(setApiKey).toHaveBeenCalledWith('sk-ant-abc123', ANTHROPIC_KEY_STORAGE));
    // Saving a key for a provider the app is not set to call would be worse
    // than not saving it.
    expect(getActiveProvider()).toBe('anthropic');
    expect(screen.getByTestId('onboarding-key-saved')).toBeInTheDocument();
  });

  it('stores the Mapbox token where the map looks for it', () => {
    toKeyStep();
    fireEvent.click(screen.getByTestId('onboarding-skip-ai'));
    fireEvent.change(screen.getByTestId('onboarding-token-input'), { target: { value: 'pk.abc' } });
    fireEvent.click(screen.getByTestId('onboarding-save-token'));
    expect(localStorage.getItem('aitp_mapbox_token')).toBe('pk.abc');
  });
});

describe('finishing', () => {
  it('hands over to the new-plan form', () => {
    show();
    fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-skip-ai'));
    fireEvent.click(screen.getByTestId('onboarding-skip-map'));
    fireEvent.click(screen.getByTestId('onboarding-create-plan'));
    expect(hasOnboarded()).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });
});
