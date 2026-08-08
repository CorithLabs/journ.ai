import { useEffect, useRef, useState } from 'react';
import { requestOnboarding } from '../services/onboarding';
import AboutJournai from '../components/onboarding/AboutJournai';
import {
  Settings,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Map as MapIcon,
} from 'lucide-react';
import {
  setApiKey,
  getApiKey,
  clearApiKey,
  hasStoredKey,
  isCryptoAvailable,
} from '../services/aiKey';
import {
  getActiveProvider,
  setActiveProvider,
  keyStorageFor,
  getAnthropicModel,
  setAnthropicModel,
  ANTHROPIC_MODELS,
  type AiProvider,
} from '../services/aiClient';
import { useAppStore } from '../store';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'valid' }
  | { kind: 'invalid'; message: string };

const MAPBOX_TOKEN_KEY = 'aitp_mapbox_token';

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};
// Expected key prefix per provider — OpenAI keys start `sk-`, Anthropic `sk-ant-`.
const KEY_PREFIX: Record<AiProvider, string> = {
  openai: 'sk-',
  anthropic: 'sk-ant-',
};

export default function SettingsPage() {
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [formatWarning, setFormatWarning] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [anthropicModel, setAnthropicModelState] = useState<string>(ANTHROPIC_MODELS[0].id);
  const setAiProvider = useAppStore((s) => s.setAiProvider);

  const [mapboxToken, setMapboxToken] = useState('');
  const [mapboxFormatWarning, setMapboxFormatWarning] = useState(false);
  const [mapboxSaved, setMapboxSaved] = useState(false);
  const [mapboxMsg, setMapboxMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cryptoOk = isCryptoAvailable();

  useEffect(() => {
    const active = getActiveProvider();
    setProvider(active);
    setHasKey(hasStoredKey(keyStorageFor(active)));
    setAnthropicModelState(getAnthropicModel());
    const stored = localStorage.getItem(MAPBOX_TOKEN_KEY);
    if (stored) setMapboxToken(stored);
  }, []);

  // Model choice applies immediately — the next AI call reads it from
  // localStorage, so there's no separate save step.
  const onModelChange = (next: string) => {
    setAnthropicModelState(next);
    setAnthropicModel(next);
  };

  // Switching provider re-reads that provider's saved-key state and clears any
  // transient save/test messages so the panel reflects the newly-selected one.
  const onProviderChange = (next: AiProvider) => {
    setProvider(next);
    setKey('');
    setFormatWarning(false);
    setSaveMsg(null);
    setTest({ kind: 'idle' });
    setHasKey(hasStoredKey(keyStorageFor(next)));
  };

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const onSave = async () => {
    setSaveMsg(null);
    setTest({ kind: 'idle' });
    const trimmed = key.trim();
    const slot = keyStorageFor(provider);

    if (!trimmed) {
      clearApiKey(slot);
      // Only fully disable BYOK when NO provider has a key left.
      if (!hasStoredKey(keyStorageFor('openai')) && !hasStoredKey(keyStorageFor('anthropic'))) {
        setAiProvider(null);
      }
      setHasKey(false);
      setSaveMsg({ ok: true, text: `${PROVIDER_LABEL[provider]} key removed.` });
      return;
    }

    if (!trimmed.startsWith(KEY_PREFIX[provider])) {
      setFormatWarning(true);
      return;
    }
    setFormatWarning(false);

    try {
      await setApiKey(trimmed, slot);
      setActiveProvider(provider); // route AI calls to the provider we just saved
      setAiProvider('byok');
      setHasKey(true);
      setKey('');
      setSaveMsg({ ok: true, text: `${PROVIDER_LABEL[provider]} key saved securely in your browser.` });
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      if (reason === 'crypto-unavailable') {
        setSaveMsg({
          ok: false,
          text: 'Your browser does not support encrypted storage — key will not be saved.',
        });
      } else {
        setSaveMsg({ ok: false, text: 'Could not save key — browser storage is full.' });
      }
    }
  };

  const onTest = async () => {
    setTest({ kind: 'testing' });
    const label = PROVIDER_LABEL[provider];
    const activeKey = key.trim() || (await getApiKey(keyStorageFor(provider)));
    if (!activeKey) {
      setTest({ kind: 'invalid', message: 'No API key to test.' });
      return;
    }
    if (!activeKey.startsWith(KEY_PREFIX[provider])) {
      setTest({
        kind: 'invalid',
        message: `Key format looks wrong (should start with "${KEY_PREFIX[provider]}").`,
      });
      return;
    }
    try {
      const resp =
        provider === 'anthropic'
          ? await fetch('https://api.anthropic.com/v1/models', {
              headers: {
                'x-api-key': activeKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
              },
            })
          : await fetch('https://api.openai.com/v1/models', {
              headers: { Authorization: `Bearer ${activeKey}` },
            });
      if (resp.ok) {
        setTest({ kind: 'valid' });
      } else {
        setTest({ kind: 'invalid', message: `Invalid key — ${label} rejected the request.` });
      }
    } catch {
      setTest({ kind: 'invalid', message: `Could not reach ${label} — check your connection.` });
    }
  };

  const flashSaved = () => {
    setMapboxSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setMapboxSaved(false), 2000);
  };

  const onMapboxSave = () => {
    setMapboxMsg(null);
    setMapboxSaved(false);
    const trimmed = mapboxToken.trim();

    if (!trimmed) {
      setMapboxFormatWarning(false);
      setMapboxMsg({ ok: false, text: 'Please enter a token before saving.' });
      return;
    }

    setMapboxToken(trimmed);
    setMapboxFormatWarning(!trimmed.startsWith('pk.'));

    try {
      localStorage.setItem(MAPBOX_TOKEN_KEY, trimmed);
      flashSaved();
    } catch {
      setMapboxMsg({ ok: false, text: 'Could not save token — browser storage is full.' });
    }
  };

  const onMapboxRemove = () => {
    localStorage.removeItem(MAPBOX_TOKEN_KEY);
    setMapboxToken('');
    setMapboxFormatWarning(false);
    setMapboxSaved(false);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setMapboxMsg({ ok: true, text: 'Mapbox token removed.' });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
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
          Bring your own OpenAI or Anthropic (Claude) API key to enable AI
          itinerary generation, route optimisation, and the AI agent.
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

        <label htmlFor="ai-provider" className="block text-sm text-ink-secondary mb-1.5">
          Provider
        </label>
        <select
          id="ai-provider"
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as AiProvider)}
          data-testid="provider-select"
          className="w-full mb-4 bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>

        {provider === 'anthropic' && (
          <>
            <label htmlFor="anthropic-model" className="block text-sm text-ink-secondary mb-1.5">
              Model
            </label>
            <select
              id="anthropic-model"
              value={anthropicModel}
              onChange={(e) => onModelChange(e.target.value)}
              data-testid="anthropic-model-select"
              className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {ANTHROPIC_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {/* A model saved before this list existed still shows as selected. */}
              {!ANTHROPIC_MODELS.some((m) => m.id === anthropicModel) && (
                <option value={anthropicModel}>{anthropicModel}</option>
              )}
            </select>
            <p className="mt-1.5 mb-4 text-xs text-ink-muted">
              Haiku is fastest and cheapest; Sonnet and Opus produce better
              itineraries for complex multi-day trips.
            </p>
          </>
        )}

        <label htmlFor="api-key" className="block text-sm text-ink-secondary mb-1.5">
          {PROVIDER_LABEL[provider]} API key
        </label>
        <input
          id="api-key"
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setFormatWarning(false);
          }}
          placeholder={hasKey ? '•••••••• (saved — enter a new key to replace)' : `${KEY_PREFIX[provider]}…`}
          autoComplete="off"
          data-testid="api-key-input"
          className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
        />

        {formatWarning && (
          <p role="alert" className="mt-1.5 text-xs text-status-warning" data-testid="format-warning">
            {PROVIDER_LABEL[provider]} keys usually start with &quot;{KEY_PREFIX[provider]}&quot;. Double-check before saving.
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

      <section
        className="max-w-lg bg-surface-glass backdrop-blur-glass border border-white/5 rounded-card shadow-glass p-5"
        aria-label="Map"
      >
        <div className="flex items-center gap-2 mb-1">
          <MapIcon size={18} className="text-accent" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-ink-primary">Map</h2>
        </div>
        <p className="text-sm text-ink-secondary mb-4">
          Add your Mapbox public token to enable the map, geocoding, and route
          visualisation.
        </p>

        <label htmlFor="mapbox-token" className="block text-sm text-ink-secondary mb-1.5">
          Mapbox Public Token
        </label>
        <input
          id="mapbox-token"
          type="text"
          value={mapboxToken}
          onChange={(e) => {
            setMapboxToken(e.target.value);
            setMapboxFormatWarning(false);
            setMapboxMsg(null);
          }}
          placeholder="pk.…"
          autoComplete="off"
          spellCheck={false}
          data-testid="mapbox-token-input"
          className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
        />

        <p className="mt-1.5 text-xs text-ink-muted">
          Get your free token at mapbox.com — starts with pk.
        </p>

        {mapboxFormatWarning && (
          <p
            role="alert"
            className="mt-1.5 text-xs text-status-warning"
            data-testid="mapbox-format-warning"
          >
            Mapbox public tokens usually start with &quot;pk.&quot;. Saved anyway — double-check it&apos;s correct.
          </p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={onMapboxSave}
            data-testid="mapbox-save-btn"
            className="bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-4 py-2 rounded-xl text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          >
            Save
          </button>
          <button
            onClick={onMapboxRemove}
            data-testid="mapbox-remove-btn"
            className="border border-accent-muted text-accent hover:bg-accent/10 px-4 py-2 rounded-xl text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          >
            Remove
          </button>
          {mapboxSaved && (
            <span
              role="status"
              className="flex items-center gap-1 text-sm text-status-success"
              data-testid="mapbox-saved-confirmation"
            >
              <CheckCircle2 size={16} /> Saved
            </span>
          )}
        </div>

        {mapboxMsg && (
          <p
            role="status"
            className={`mt-3 text-sm ${mapboxMsg.ok ? 'text-status-success' : 'text-status-danger'}`}
            data-testid="mapbox-msg"
          >
            {mapboxMsg.text}
          </p>
        )}
      </section>
      {/* The same definition the introduction shows, so the two cannot
          disagree about what the app promises. */}
      <section className="border-t border-white/5 pt-4 mt-4">
        <h2 className="text-lg font-semibold text-ink-primary mb-3">About Journ.ai</h2>
        <AboutJournai />
      </section>

      {/* Anything the introduction offered can be reached from this page, so
          replaying it is a reminder rather than the only route back. */}
      <section className="border-t border-white/5 pt-4 mt-4">
        <h2 className="text-sm font-semibold text-ink-primary mb-1">Introduction</h2>
        <p className="text-xs text-ink-secondary mb-3">
          Walk through what Journ.ai does and what the optional keys are for.
        </p>
        <button
          onClick={requestOnboarding}
          className="text-xs px-3 py-2 rounded-xl border border-white/10 text-ink-secondary hover:text-ink-primary transition-colors"
          data-testid="replay-onboarding"
        >
          Show the introduction again
        </button>
      </section>
    </div>
  );
}
