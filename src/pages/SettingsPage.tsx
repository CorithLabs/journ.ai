import { useEffect, useState } from 'react';
import { Settings, ShieldCheck, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import {
  setApiKey,
  getApiKey,
  clearApiKey,
  hasStoredKey,
  isCryptoAvailable,
} from '../services/aiKey';
import { useAppStore } from '../store';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'valid' }
  | { kind: 'invalid'; message: string };

export default function SettingsPage() {
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [formatWarning, setFormatWarning] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const setAiProvider = useAppStore((s) => s.setAiProvider);

  const cryptoOk = isCryptoAvailable();

  useEffect(() => {
    setHasKey(hasStoredKey());
  }, []);

  const onSave = async () => {
    setSaveMsg(null);
    setTest({ kind: 'idle' });
    const trimmed = key.trim();

    // Clearing the field and saving removes the key → degraded mode.
    if (!trimmed) {
      clearApiKey();
      setAiProvider(null);
      setHasKey(false);
      setSaveMsg({ ok: true, text: 'API key removed. AI features are now disabled.' });
      return;
    }

    // Client-side format warning before persisting.
    if (!trimmed.startsWith('sk-')) {
      setFormatWarning(true);
      return;
    }
    setFormatWarning(false);

    try {
      await setApiKey(trimmed);
      setAiProvider('byok');
      setHasKey(true);
      setKey('');
      setSaveMsg({ ok: true, text: 'API key saved securely in your browser.' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      if (reason === 'crypto-unavailable') {
        setSaveMsg({
          ok: false,
          text: 'Your browser does not support encrypted storage — key will not be saved.',
        });
      } else {
        // QuotaExceededError and friends → never persist a plaintext fallback.
        setSaveMsg({ ok: false, text: 'Could not save key — browser storage is full.' });
      }
    }
  };

  const onTest = async () => {
    setTest({ kind: 'testing' });
    // Decrypt in-memory for the duration of the test call only.
    const activeKey = key.trim() || (await getApiKey());
    if (!activeKey) {
      setTest({ kind: 'invalid', message: 'No API key to test.' });
      return;
    }
    if (!activeKey.startsWith('sk-')) {
      setTest({ kind: 'invalid', message: 'Key format looks wrong (should start with "sk-").' });
      return;
    }
    try {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${activeKey}` },
      });
      if (resp.ok) {
        setTest({ kind: 'valid' });
      } else {
        setTest({ kind: 'invalid', message: 'Invalid key — OpenAI rejected the request.' });
      }
    } catch {
      setTest({ kind: 'invalid', message: 'Could not reach OpenAI — check your connection.' });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={24} className="text-accent" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-ink-primary tracking-tight">Settings</h1>
      </div>

      <section
        className="max-w-lg bg-surface-glass backdrop-blur-glass border border-white/5 rounded-card shadow-glass p-5"
        aria-label="AI Provider"
      >
        <h2 className="text-lg font-semibold text-ink-primary mb-1">AI Provider</h2>
        <p className="text-sm text-ink-secondary mb-4">
          Bring your own OpenAI API key to enable AI itinerary generation, route
          optimisation, and the AI agent.
        </p>

        {!cryptoOk && (
          <div
            role="alert"
            className="flex items-start gap-2 mb-4 p-3 bg-status-warning/10 border border-status-warning/20 rounded-xl"
          >
            <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" />
            <p className="text-sm text-status-warning">
              Your browser does not support encrypted storage — key will not be saved.
            </p>
          </div>
        )}

        <label htmlFor="api-key" className="block text-sm text-ink-secondary mb-1.5">
          OpenAI API key
        </label>
        <input
          id="api-key"
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setFormatWarning(false);
          }}
          placeholder={hasKey ? '•••••••• (saved — enter a new key to replace)' : 'sk-…'}
          autoComplete="off"
          data-testid="api-key-input"
          className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
        />

        {formatWarning && (
          <p role="alert" className="mt-1.5 text-xs text-status-warning" data-testid="format-warning">
            API keys usually start with &quot;sk-&quot;. Double-check before saving.
          </p>
        )}

        <div className="flex items-start gap-2 mt-3 mb-4 text-xs text-ink-muted">
          <ShieldCheck size={14} className="text-accent shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Your key is stored only in your browser and never sent to our servers.
            It is encrypted at rest with AES-GCM.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            disabled={!cryptoOk}
            data-testid="save-key-btn"
            className="bg-accent hover:bg-accent-light disabled:opacity-60 text-ink-inverse font-semibold px-4 py-2 rounded-xl text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          >
            Save
          </button>
          <button
            onClick={onTest}
            disabled={test.kind === 'testing'}
            data-testid="test-connection-btn"
            className="border border-accent-muted text-accent hover:bg-accent/10 px-4 py-2 rounded-xl text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          >
            {test.kind === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
        </div>

        {test.kind === 'valid' && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-status-success" data-testid="test-result">
            <CheckCircle2 size={16} /> Valid
          </p>
        )}
        {test.kind === 'invalid' && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-status-danger" data-testid="test-result">
            <XCircle size={16} /> {test.message}
          </p>
        )}
        {saveMsg && (
          <p
            role="status"
            className={`mt-3 text-sm ${saveMsg.ok ? 'text-status-success' : 'text-status-danger'}`}
            data-testid="save-result"
          >
            {saveMsg.text}
          </p>
        )}
      </section>
    </div>
  );
}
