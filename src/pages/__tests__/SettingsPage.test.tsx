import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SettingsPage from '../SettingsPage';
import * as aiKey from '../../services/aiKey';

// Keep the real storage-key constants (aiClient.keyStorageFor reads them) and
// mock only the functions — a full mock without the constants makes the
// provider-aware SettingsPage throw on render.
vi.mock('../../services/aiKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/aiKey')>();
  return {
    ...actual,
    setApiKey: vi.fn().mockResolvedValue(undefined),
    getApiKey: vi.fn().mockResolvedValue(null),
    clearApiKey: vi.fn(),
    hasStoredKey: vi.fn().mockReturnValue(false),
    isCryptoAvailable: vi.fn().mockReturnValue(true),
  };
});

const MAPBOX_KEY = 'aitp_mapbox_token';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiKey.isCryptoAvailable).mockReturnValue(true);
  vi.mocked(aiKey.hasStoredKey).mockReturnValue(false);
  vi.mocked(aiKey.getApiKey).mockResolvedValue(null);
  // Use real jsdom localStorage — clear it between tests
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

// ── BYOK API key tests ────────────────────────────────────────────────────────
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
      // Now provider-aware: (key, storageSlot). Default provider is OpenAI.
      expect(aiKey.setApiKey).toHaveBeenCalledWith('sk-valid-key-123', 'aitp_api_key');
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

// ── Mapbox token tests ────────────────────────────────────────────────────────
describe('SettingsPage — Mapbox token', () => {
  it('renders the Map section with an input and helper text', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('region', { name: /Map/i })).toBeInTheDocument();
    expect(screen.getByTestId('mapbox-token-input')).toBeInTheDocument();
    expect(screen.getByText(/mapbox\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/starts with/i)).toBeInTheDocument();
  });

  it('shows the token input as type=text (unmasked — public token)', () => {
    render(<SettingsPage />);
    expect(screen.getByTestId('mapbox-token-input')).toHaveAttribute('type', 'text');
  });

  it('pre-fills the token input with the stored value on mount', async () => {
    localStorage.setItem(MAPBOX_KEY, 'pk.existing-token');
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-token-input')).toHaveValue('pk.existing-token');
    });
  });

  it('saves a valid pk. token to localStorage', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: 'pk.eyJ1IjoiamU' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(localStorage.getItem(MAPBOX_KEY)).toBe('pk.eyJ1IjoiamU');
      expect(screen.getByTestId('mapbox-saved-confirmation')).toBeInTheDocument();
    });
  });

  it('shows a format warning for a non-pk. token but still saves it', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: 'sk.wrong-prefix-token' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-format-warning')).toBeInTheDocument();
      // Still saved despite the warning
      expect(localStorage.getItem(MAPBOX_KEY)).toBe('sk.wrong-prefix-token');
    });
  });

  it('trims leading/trailing whitespace before saving', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: '  pk.trimmed  ' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(localStorage.getItem(MAPBOX_KEY)).toBe('pk.trimmed');
    });
  });

  it('Remove button clears localStorage and resets the input', async () => {
    localStorage.setItem(MAPBOX_KEY, 'pk.existing-token');
    render(<SettingsPage />);
    // Wait for the useEffect to load the token into state
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-token-input')).toHaveValue('pk.existing-token');
    });
    const removeBtn = screen.getByTestId('mapbox-remove-btn');
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(localStorage.getItem(MAPBOX_KEY)).toBeNull();
      expect(screen.getByTestId('mapbox-token-input')).toHaveValue('');
      expect(screen.getByTestId('mapbox-msg')).toHaveTextContent(/removed/i);
    });
  });

  it('shows an error when saving an empty token', async () => {
    render(<SettingsPage />);
    // Input is empty — click save immediately
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-msg')).toHaveTextContent(/enter a token/i);
    });
    expect(localStorage.getItem(MAPBOX_KEY)).toBeNull();
  });

  it('shows ✓ Saved confirmation inline next to the save button', async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('mapbox-token-input'), {
      target: { value: 'pk.valid' },
    });
    fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-saved-confirmation')).toBeInTheDocument();
    });
  });

  it('Saved confirmation disappears after 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Render without React batching issues
    act(() => { render(<SettingsPage />); });
    act(() => {
      fireEvent.change(screen.getByTestId('mapbox-token-input'), {
        target: { value: 'pk.valid' },
      });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('mapbox-save-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('mapbox-saved-confirmation')).toBeInTheDocument();
    });
    act(() => { vi.advanceTimersByTime(2100); });
    await waitFor(() => {
      expect(screen.queryByTestId('mapbox-saved-confirmation')).not.toBeInTheDocument();
    });
  });
});

/*
 * The forecast is fetched for every plan already; this decides how it reads.
 * Celsius by default because that is what the forecast arrives in, so the
 * default costs no conversion.
 */
describe('temperature unit', () => {
  it('starts in Celsius', () => {
    localStorage.clear();
    render(<SettingsPage />);
    expect(screen.getByTestId('temp-unit-C')).toHaveAttribute('aria-pressed', 'true');
  });

  it('remembers Fahrenheit', () => {
    localStorage.clear();
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId('temp-unit-F'));
    expect(localStorage.getItem('aitp_temp_unit')).toBe('F');
    expect(screen.getByTestId('temp-unit-F')).toHaveAttribute('aria-pressed', 'true');
  });
});
