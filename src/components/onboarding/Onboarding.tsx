import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Sparkles, Map, Check, ArrowRight, ShieldCheck } from 'lucide-react';
import { setApiKey, OPENAI_KEY_STORAGE, ANTHROPIC_KEY_STORAGE } from '../../services/aiKey';
import { setActiveProvider, type AiProvider } from '../../services/aiClient';
import { setOnboarded } from '../../services/onboarding';
import AboutJournai from './AboutJournai';

const MAPBOX_TOKEN_KEY = 'aitp_mapbox_token';

const KEY_PREFIX: Record<AiProvider, string> = { openai: 'sk-', anthropic: 'sk-ant-' };
const PROVIDER_LABEL: Record<AiProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic' };
const KEY_URL: Record<AiProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
};

type Step = 'welcome' | 'about' | 'ai' | 'map' | 'ready';
const ORDER: Step[] = ['welcome', 'about', 'ai', 'map', 'ready'];

interface Props {
  onClose: () => void;
}

/**
 * The first run.
 *
 * Both keys the app can use are optional, and saying so is the whole point of
 * this flow: a plan can be built entirely by hand, and the map is a separate
 * decision from the AI. Someone who lands on a wall of key fields with no
 * indication that they can skip assumes the app is unusable without them.
 */
export default function Onboarding({ onClose }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const panelRef = useRef<HTMLDivElement>(null);

  const [provider, setProvider] = useState<AiProvider>('openai');
  const [key, setKey] = useState('');
  const [keyState, setKeyState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [keyError, setKeyError] = useState('');

  const [token, setToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);

  const finish = (then?: () => void) => {
    setOnboarded();
    onClose();
    then?.();
  };

  // Escape skips the whole thing, like every other dismissible layer in the
  // app. It is an introduction, not a gate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    panelRef.current?.focus();
  }, [step]);

  const saveKey = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith(KEY_PREFIX[provider])) {
      setKeyState('error');
      setKeyError(`That does not look like an ${PROVIDER_LABEL[provider]} key — they start with "${KEY_PREFIX[provider]}".`);
      return;
    }
    setKeyState('saving');
    setKeyError('');
    try {
      await setApiKey(trimmed, provider === 'anthropic' ? ANTHROPIC_KEY_STORAGE : OPENAI_KEY_STORAGE);
      setActiveProvider(provider);
      setKeyState('saved');
      setKey('');
    } catch {
      setKeyState('error');
      setKeyError('Could not save the key on this device.');
    }
  };

  const saveToken = () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(MAPBOX_TOKEN_KEY, trimmed);
      setTokenSaved(true);
      setToken('');
    } catch {
      /* storage full — the map simply stays unconfigured */
    }
  };

  const index = ORDER.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" data-testid="onboarding">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-md max-h-full overflow-y-auto bg-surface-overlay border border-white/10 rounded-modal shadow-glass p-6 focus:outline-none"
      >
        {/* Position first: four screens with no end in sight is why people
            close a first-run flow. */}
        <div className="flex items-center gap-1.5 mb-5" aria-hidden="true">
          {ORDER.map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= index ? 'bg-accent' : 'bg-white/10'}`}
            />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="space-y-4" data-testid="onboarding-welcome">
            <Compass size={36} className="text-accent" aria-hidden="true" />
            <h2 id="onboarding-title" className="text-xl font-bold text-ink-primary tracking-tight">
              Plan a trip, day by day
            </h2>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Build an itinerary in parts of the day rather than exact times, keep bookings
              and confirmations in a clipboard beside it, and see the whole trip on a map.
            </p>
            <div className="flex gap-3 items-start bg-surface-raised border border-white/10 rounded-card p-3">
              <ShieldCheck size={16} className="text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-ink-secondary leading-relaxed">
                Everything stays on this device. Your trips live in this browser, and any API
                keys you add are encrypted here — there is no account and no server holding them.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStep('about')}
                className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold py-2.5 rounded-xl transition-colors"
                data-testid="onboarding-next"
              >
                Get started <ArrowRight size={16} aria-hidden="true" />
              </button>
              <button onClick={() => finish()} className="px-4 py-2.5 rounded-xl text-sm text-ink-muted hover:text-ink-primary" data-testid="onboarding-skip">
                Skip
              </button>
            </div>
          </div>
        )}

        {step === 'about' && (
          <div className="space-y-4" data-testid="onboarding-about">
            <h2 id="onboarding-title" className="text-xl font-bold text-ink-primary tracking-tight">
              Before you start
            </h2>
            {/* The second list is the point. Every line in it is something a
                traveller could reasonably assume a travel app does, and being
                wrong about any of them costs more than the app is worth. */}
            <AboutJournai />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStep('ai')}
                className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold py-2.5 rounded-xl transition-colors"
                data-testid="onboarding-about-next"
              >
                Got it <ArrowRight size={16} aria-hidden="true" />
              </button>
              <button onClick={() => finish()} className="px-4 py-2.5 rounded-xl text-sm text-ink-muted hover:text-ink-primary" data-testid="onboarding-skip-about">
                Skip
              </button>
            </div>
          </div>
        )}

        {step === 'ai' && (
          <div className="space-y-4" data-testid="onboarding-ai">
            <Sparkles size={32} className="text-accent" aria-hidden="true" />
            <h2 id="onboarding-title" className="text-xl font-bold text-ink-primary tracking-tight">
              Add an AI key, or don't
            </h2>
            {/* The manual path is real and finished, so it is offered as a
                choice rather than buried as a consolation. */}
            <p className="text-sm text-ink-secondary leading-relaxed">
              With a key, the app can draft a whole itinerary and answer questions about your
              trip. Without one, you can still build every day by hand — nothing else is
              locked. You bring your own key and pay your provider directly.
            </p>

            <div className="flex gap-1" role="group" aria-label="AI provider">
              {(['openai', 'anthropic'] as AiProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setProvider(p); setKeyState('idle'); setKeyError(''); }}
                  aria-pressed={provider === p}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    provider === p
                      ? 'bg-accent/15 border-accent/40 text-ink-primary'
                      : 'border-white/10 text-ink-secondary hover:text-ink-primary'
                  }`}
                  data-testid={`onboarding-provider-${p}`}
                >
                  {PROVIDER_LABEL[p]}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <input
                type="password"
                value={key}
                onChange={(e) => { setKey(e.target.value); setKeyState('idle'); }}
                placeholder={`${KEY_PREFIX[provider]}…`}
                aria-label={`${PROVIDER_LABEL[provider]} API key`}
                className="w-full bg-surface-raised border border-white/10 rounded-lg px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
                data-testid="onboarding-key-input"
              />
              <a href={KEY_URL[provider]} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-accent hover:underline">
                Where do I get a key?
              </a>
              {keyState === 'saved' && (
                <p className="flex items-center gap-1 text-xs text-status-success" data-testid="onboarding-key-saved">
                  <Check size={12} aria-hidden="true" /> Key saved and encrypted on this device.
                </p>
              )}
              {keyState === 'error' && (
                <p className="text-xs text-status-danger" role="alert" data-testid="onboarding-key-error">{keyError}</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={keyState === 'saved' ? () => setStep('map') : saveKey}
                disabled={keyState === 'saving' || (keyState !== 'saved' && !key.trim())}
                className="flex-1 bg-accent hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-ink-inverse font-semibold py-2.5 rounded-xl transition-colors"
                data-testid="onboarding-save-key"
              >
                {keyState === 'saving' ? 'Saving…' : keyState === 'saved' ? 'Continue' : 'Save key'}
              </button>
              <button onClick={() => setStep('map')} className="px-4 py-2.5 rounded-xl text-sm text-ink-secondary border border-white/10 hover:text-ink-primary" data-testid="onboarding-skip-ai">
                I'll plan manually
              </button>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4" data-testid="onboarding-map">
            <Map size={32} className="text-accent" aria-hidden="true" />
            <h2 id="onboarding-title" className="text-xl font-bold text-ink-primary tracking-tight">
              Put the trip on a map
            </h2>
            <p className="text-sm text-ink-secondary leading-relaxed">
              A Mapbox token draws your days as pins and routes. It is free for personal use,
              and separate from the AI key — you can add it later in Settings.
            </p>
            <div className="space-y-2">
              <input
                type="password"
                value={token}
                onChange={(e) => { setToken(e.target.value); setTokenSaved(false); }}
                placeholder="pk.…"
                aria-label="Mapbox access token"
                className="w-full bg-surface-raised border border-white/10 rounded-lg px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
                data-testid="onboarding-token-input"
              />
              <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-accent hover:underline">
                Where do I get a token?
              </a>
              {tokenSaved && (
                <p className="flex items-center gap-1 text-xs text-status-success" data-testid="onboarding-token-saved">
                  <Check size={12} aria-hidden="true" /> Token saved.
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={tokenSaved ? () => setStep('ready') : saveToken}
                disabled={!tokenSaved && !token.trim()}
                className="flex-1 bg-accent hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-ink-inverse font-semibold py-2.5 rounded-xl transition-colors"
                data-testid="onboarding-save-token"
              >
                {tokenSaved ? 'Continue' : 'Save token'}
              </button>
              <button onClick={() => setStep('ready')} className="px-4 py-2.5 rounded-xl text-sm text-ink-secondary border border-white/10 hover:text-ink-primary" data-testid="onboarding-skip-map">
                Not now
              </button>
            </div>
          </div>
        )}

        {step === 'ready' && (
          <div className="space-y-4" data-testid="onboarding-ready">
            <Check size={32} className="text-status-success" aria-hidden="true" />
            <h2 id="onboarding-title" className="text-xl font-bold text-ink-primary tracking-tight">
              You're set
            </h2>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Name a destination and pick your dates, and you'll have a trip to build on.
              Anything you skipped is in Settings whenever you want it.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => finish(() => navigate('/plan/new'))}
                className="flex-1 bg-accent hover:bg-accent-light text-ink-inverse font-semibold py-2.5 rounded-xl transition-colors"
                data-testid="onboarding-create-plan"
              >
                Create your first trip
              </button>
              <button onClick={() => finish()} className="px-4 py-2.5 rounded-xl text-sm text-ink-secondary border border-white/10 hover:text-ink-primary" data-testid="onboarding-look-around">
                Look around first
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
