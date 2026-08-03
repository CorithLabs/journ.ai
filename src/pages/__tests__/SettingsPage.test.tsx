import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '../SettingsPage';
import * as aiKey from '../../services/aiKey';

vi.mock('../../services/aiKey', () => ({
  setApiKey: vi.fn().mockResolvedValue(undefined),
  getApiKey: vi.fn().mockResolvedValue(null),
  clearApiKey: vi.fn(),
  hasStoredKey: vi.fn().mockReturnValue(false),
  isCryptoAvailable: vi.fn().mockReturnValue(true),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiKey.isCryptoAvailable).mockReturnValue(true);
  vi.mocked(aiKey.hasStoredKey).mockReturnValue(false);
  vi.mocked(aiKey.getApiKey).mockResolvedValue(null);
});

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
