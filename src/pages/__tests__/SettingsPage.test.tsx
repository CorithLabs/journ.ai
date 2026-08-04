import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SettingsPage from '../SettingsPage';
import * as aiKey from '../../services/aiKey';

vi.mock('../../services/aiKey', () => ({
  setApiKey: vi.fn().mockResolvedValue(undefined),
  getApiKey: vi.fn().mockResolvedValue(null),
  clearApiKey: vi.fn(),
  hasStoredKey: vi.fn().mockReturnValue(false),
  isCryptoAvailable: vi.fn().mockReturnValue(true),
}));

// ── localStorage helpers ─────────────────────────────────────────────────────
const MAPBOX_KEY = 'aitp_mapbox_token';

let localStorageStore: Record<string, string> = {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiKey.isCryptoAvailable).mockReturnValue(true);
  vi.mocked(aiKey.hasStoredKey).mockReturnValue(false);
  vi.mocked(aiKey.getApiKey).mockResolvedValue(null);

  // Reset localStorage mock
  localStorageStore = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
    (key: string) => localStorageStore[key] ?? null,
  );
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
    (key: string, value: string) => { localStorageStore[key] = value; },
  );
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
    (key: string) => { delete localStorageStore[key]; },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── BYOK API key tests (existing) ────────────────────────────────────────────
describe('SettingsPage — BYOK', () => {
  it('renders the AI Provider section with a privacy notice', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('region', { name: /AI Provider/i })).toBeInTheDocument();
    expect(
      screen.getByText(/stored only in your browser and never sent to our servers/i),
    ).toBeInTheDocument();
  });

  it('masks the API key input (type=password)', () => {
    render(<SettingsPage />);
    expect(screen.getByTestId('api-key-input')).toHaveAttribute('type', 'password');
  });

  it('saves a valid key via the encrypted setApiKey service', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('api-key-input'), {
      target: { value: 'sk-valid-key-123' },
    });
    fireEvent.click(screen.getByTestId('save-key-btn'));
    await waitFor(() => {
      expect(aiKey.setApiKey).toHaveBeenCalledWith('sk-valid-key-123');
      expect(screen.getByTestId('save-result')).toHaveTextContent(/saved securely/i);
    });
  });

  it('shows a format warning for a key not starting with sk-', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('api-key-input'), {
      target: { value: 'not-a-key' },
    });
    fireEvent.click(screen.getByTestId('save-key-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('format-warning')).toBeInTheDocument();
    });
    expect(aiKey.setApiKey).not.toHaveBeenCalled();
  });

  it('clearing the field and saving removes the key', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId('save-key-btn'));
    await waitFor(() => {
      expect(aiKey.clearApiKey).toHaveBeenCalled();
      expect(screen.getByTestId('save-result')).toHaveTextContent(/removed/i);
    });
  });

  it('Test Connection shows ✓ Valid on a 200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('api-key-input'), {
      target: { value: 'sk-valid-key-123' },
    });
    fireEvent.click(screen.getByTestId('test-connection-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('test-result')).toHaveTextContent('Valid');
    });
  });

  it('Test Connection shows an invalid message on a 401 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('api-key-input'), {
      target: { value: 'sk-bad-key' },
    });
    fireEvent.click(screen.getByTestId('test-connection-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('test-result')).toHaveTextContent(/Invalid/i);
    });
  });

  it('Test Connection shows a network error message on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('api-key-input'), {
      target: { value: 'sk-key' },
    });
    fireEvent.click(screen.getByTestId('test-connection-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('test-result')).toHaveTextContent(/Could not reach OpenAI/i);
    });
  });

  it('disables save and warns when crypto is unavailable', () => {
    vi.mocked(aiKey.isCryptoAvailable).mockReturnValue(false);
    render(<SettingsPage />);
    expect(screen.getByTestId('save-key-btn')).toBeDisabled();
    expect(
      screen.getByText(/does not support encrypted storage/i),
    ).toBeInTheDocument();
  });
});

// ── Mapbox token tests (new) ──────────────────────────────────────────────────
describe('SettingsPage — Mapbox token', () => {
  it('renders the Map section', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('region', { name: /Map/i })).toBeInTheDocument();
    expect(screen.getByTestId('mapbox-token-input')).toBeInTheDocument();
  });

  it('pre-fills the token input with the stored value', () => {
    localStorageStore[MAPBOX_KEY] = 'pk.existing-token';
    render(<SettingsPage />);
    expect(screen.getByTestId('mapbox-token-input')).toHaveValue('pk.existing-token');
  });

  it('saves a valid pk. token to localStorage', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: 'pk.eyJ1IjoiamU' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(localStorageStore[MAPBOX_KEY]).toBe('pk.eyJ1IjoiamU');
      expect(screen.getByTestId('mapbox-saved-confirmation')).toBeInTheDocument();
    });
  });

  it('shows a format warning for a token not starting with pk. but still saves', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: 'sk.invalid-mapbox-token' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-format-warning')).toBeInTheDocument();
      // Token IS still saved (save is not blocked — just warned)
      expect(localStorageStore[MAPBOX_KEY]).toBe('sk.invalid-mapbox-token');
    });
  });

  it('trims leading/trailing whitespace from the token before saving', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: '  pk.trimmed-token  ' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(localStorageStore[MAPBOX_KEY]).toBe('pk.trimmed-token');
    });
  });

  it('Remove button clears localStorage and resets the input', async () => {
    localStorageStore[MAPBOX_KEY] = 'pk.existing-token';
    render(<SettingsPage />);
    // Remove button should appear because a token is loaded
    const removeBtn = screen.getByTestId('mapbox-remove-btn');
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(localStorageStore[MAPBOX_KEY]).toBeUndefined();
      expect(screen.getByTestId('mapbox-token-input')).toHaveValue('');
      expect(screen.getByTestId('mapbox-msg')).toHaveTextContent(/removed/i);
    });
  });

  it('shows an error message when localStorage is full', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: 'pk.valid-token' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-msg')).toHaveTextContent(/browser storage is full/i);
    });
  });

  it('shows an error when trying to save an empty token', async () => {
    render(<SettingsPage />);
    // Leave input empty
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-msg')).toHaveTextContent(/enter a token/i);
    });
    expect(localStorageStore[MAPBOX_KEY]).toBeUndefined();
  });

  it('shows the helper note about mapbox.com', () => {
    render(<SettingsPage />);
    expect(screen.getByText(/mapbox.com/i)).toBeInTheDocument();
    expect(screen.getByText(/starts with/i)).toBeInTheDocument();
  });

  it('shows ✓ Saved confirmation inline next to save button', async () => {
    vi.useFakeTimers();
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: 'pk.valid' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-saved-confirmation')).toBeInTheDocument();
    });
    // After 2 seconds the confirmation should disappear
    act(() => { vi.advanceTimersByTime(2100); });
    await waitFor(() => {
      expect(screen.queryByTestId('mapbox-saved-confirmation')).not.toBeInTheDocument();
    });
    vi.useRealTimers();
  });
});
