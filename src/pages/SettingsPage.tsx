import { useEffect, useState } from 'react';
import { Settings, Sparkles, Check, X } from 'lucide-react';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  OPENAI_KEY_STORAGE,
  ANTHROPIC_KEY_STORAGE,
} from '../services/aiKey';
import {
  getActiveProvider,
  setActiveProvider,
  ANTHROPIC_MODEL,
  type AiProvider,
} from '../services/aiClient';

type TestState = 'idle' | 'testing' | 'valid' | 'invalid';

interface ProviderConfig {
  id: AiProvider;
  label: string;
  storageKey: string;
  placeholder: string;
  helper: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    storageKey: OPENAI_KEY_STORAGE,
    placeholder: 'sk-...',
    helper: "Your key starts with 'sk-'. Get it at platform.openai.com.",
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    storageKey: ANTHROPIC_KEY_STORAGE,
    placeholder: 'sk-ant-...',
    helper: "Your key starts with 'sk-ant-'. Get it at console.anthropic.com.",
  },
];

export default function SettingsPage() {
  const [provider, setProvider] = useState<AiProvider>(getActiveProvider());
  const [keyInput, setKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const config = PROVIDERS.find((p) => p.id === provider)!;

  // Reflect whether a key is already stored for the selected provider (we
  // never render the plaintext key).
  useEffect(() => {
    setKeyInput('');
    setSaveError(null);
    setTestState('idle');
    setTestMessage(null);
    getApiKey(config.storageKey).then((k) => setHasStoredKey(!!k));
  }, [config.storageKey]);

  const handleProviderChange = (next: AiProvider) => {
    // Persist the selection. Switching does NOT delete the previous provider's
    // stored key — the user can switch back without re-entering.
    setActiveProvider(next);
    setProvider(next);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaved(false);
    const trimmed = keyInput.trim(); // trim guard (same as OpenAI key fix)
    if (!trimmed) {
      setSaveError('Please enter a valid API key.');
      return;
    }
    const expectedPrefix = provider === 'anthropic' ? 'sk-ant-' : 'sk-';
    if (!trimmed.startsWith(expectedPrefix)) {
      setSaveError(
        `Warning: ${config.label} keys usually start with '${expectedPrefix}'. Saved anyway.`,
      );
    }
    try {
      await setApiKey(trimmed, config.storageKey);
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
    clearApiKey(config.storageKey);
    setHasStoredKey(false);
    setKeyInput('');
    setTestState('idle');
    setTestMessage(null);
  };

  const handleTest = async () => {
    setTestState('testing');
    setTestMessage(null);
    try {
      const key = await getApiKey(config.storageKey);
      if (!key) {
        setTestState('invalid');
        setTestMessage('No key stored. Save your key first.');
        return;
      }

      let ok: boolean;
      let status = 0;
      if (provider === 'anthropic') {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        ok = resp.ok;
        status = resp.status;
      } else {
        const resp = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        ok = resp.ok;
        status = resp.status;
      }

      if (ok) {
        setTestState('valid');
        setTestMessage('Connection valid.');
      } else {
        setTestState('invalid');
        setTestMessage(
          status === 401
            ? `Invalid key — ${config.label} rejected the request.`
            : `${config.label} returned ${status}.`,
        );
      }
    } catch {
      setTestState('invalid');
      setTestMessage(`Could not reach ${config.label} — check your connection.`);
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

        {/* Provider toggle */}
        <div
          className="inline-flex rounded-xl bg-surface-overlay border border-white/10 p-1 mb-4"
          role="tablist"
          aria-label="AI provider"
        >
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={provider === p.id}
              onClick={() => handleProviderChange(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none ${
                provider === p.id
                  ? 'bg-accent text-ink-inverse'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
              data-testid={`provider-tab-${p.id}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p className="text-sm text-ink-secondary mb-4">
          Your key is stored only in your browser (encrypted at rest) and never
          sent to our servers.
        </p>

        <label
          htmlFor="provider-key"
          className="block text-sm text-ink-secondary mb-1"
        >
          {config.label} API Key
          {hasStoredKey && (
            <span className="ml-2 text-xs text-status-success">✓ key saved</span>
          )}
        </label>
        <input
          id="provider-key"
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={hasStoredKey ? '•••••••••• (saved)' : config.placeholder}
          className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
          data-testid="provider-key-input"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-ink-muted">{config.helper}</p>

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
