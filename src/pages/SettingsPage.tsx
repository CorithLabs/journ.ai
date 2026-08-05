import { useEffect, useState } from 'react';
import { Settings, Sparkles, Check, X } from 'lucide-react';
import { getApiKey, setApiKey, clearApiKey } from '../services/aiKey';

type TestState = 'idle' | 'testing' | 'valid' | 'invalid';

export default function SettingsPage() {
  const [keyInput, setKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);

  // Reflect whether a key is already stored (we never render the plaintext key).
  useEffect(() => {
    getApiKey().then((k) => setHasStoredKey(!!k));
  }, []);

  const handleSave = async () => {
    setSaveError(null);
    setSaved(false);
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setSaveError('Please enter a valid API key.');
      return;
    }
    if (!trimmed.startsWith('sk-')) {
      // Soft warning — still allow save (the key may be from a compatible
      // provider), but flag the unusual format.
      setSaveError("Warning: OpenAI keys usually start with 'sk-'. Saved anyway.");
    }
    try {
      await setApiKey(trimmed);
      setHasStoredKey(true);
      setKeyInput('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'Could not save key — browser storage may be unavailable.',
      );
    }
  };

  const handleClear = () => {
    clearApiKey();
    setHasStoredKey(false);
    setKeyInput('');
    setTestState('idle');
    setTestMessage(null);
  };

  const handleTest = async () => {
    setTestState('testing');
    setTestMessage(null);
    try {
      const key = await getApiKey();
      if (!key) {
        setTestState('invalid');
        setTestMessage('No key stored. Save your key first.');
        return;
      }
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (resp.ok) {
        setTestState('valid');
        setTestMessage('Connection valid.');
      } else {
        setTestState('invalid');
        setTestMessage(
          resp.status === 401
            ? 'Invalid key — OpenAI rejected the request.'
            : `OpenAI returned ${resp.status}.`,
        );
      }
    } catch {
      setTestState('invalid');
      setTestMessage('Could not reach OpenAI — check your connection.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={24} className="text-accent" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-ink-primary tracking-tight">
          Settings
        </h1>
      </div>

      <section
        className="max-w-lg bg-surface-glass backdrop-blur-glass border border-white/5 rounded-card shadow-glass p-5"
        aria-labelledby="ai-provider-heading"
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-accent" aria-hidden="true" />
          <h2
            id="ai-provider-heading"
            className="text-lg font-semibold text-ink-primary"
          >
            AI Provider
          </h2>
        </div>
        <p className="text-sm text-ink-secondary mb-4">
          Your key is stored only in your browser (encrypted at rest) and never
          sent to our servers.
        </p>

        <label
          htmlFor="openai-key"
          className="block text-sm text-ink-secondary mb-1"
        >
          OpenAI API Key
          {hasStoredKey && (
            <span className="ml-2 text-xs text-status-success">✓ key saved</span>
          )}
        </label>
        <input
          id="openai-key"
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={hasStoredKey ? '•••••••••• (saved)' : 'sk-...'}
          className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
          data-testid="openai-key-input"
          autoComplete="off"
        />

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button
            onClick={handleSave}
            className="bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-4 py-2 rounded-xl transition-colors text-sm focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            data-testid="save-key-btn"
          >
            Save
          </button>
          <button
            onClick={handleTest}
            disabled={testState === 'testing' || !hasStoredKey}
            className="border border-accent-muted text-accent hover:bg-accent/10 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors text-sm focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            data-testid="test-connection-btn"
          >
            {testState === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
          {hasStoredKey && (
            <button
              onClick={handleClear}
              className="text-ink-muted hover:text-status-danger px-3 py-2 rounded-xl transition-colors text-sm"
              data-testid="clear-key-btn"
            >
              Clear
            </button>
          )}
          {saved && (
            <span
              role="status"
              className="text-xs text-status-success"
              data-testid="save-confirmation"
            >
              ✓ Saved
            </span>
          )}
        </div>

        {saveError && (
          <p role="alert" className="mt-2 text-xs text-status-warning">
            {saveError}
          </p>
        )}

        {testMessage && (
          <div
            role="status"
            className={`mt-3 flex items-center gap-1.5 text-sm ${
              testState === 'valid' ? 'text-status-success' : 'text-status-danger'
            }`}
          >
            {testState === 'valid' ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <X size={14} aria-hidden="true" />
            )}
            {testMessage}
          </div>
        )}
      </section>
    </div>
  );
}
