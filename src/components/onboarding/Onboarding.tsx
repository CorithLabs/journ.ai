import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CloudSun, Paperclip, Sparkles, X } from 'lucide-react';
import { setOnboarded } from '../../services/onboarding';
import { DEMO_PLAN_ID } from '../../db/seed';

interface Props {
  onClose: () => void;
}

const KEEPS = [
  { icon: CalendarDays, label: 'Your plan, day by day' },
  { icon: CloudSun, label: 'The weather for each day' },
  { icon: Paperclip, label: 'Boarding passes, check-ins and booking emails' },
  // Said, so the AI is not a surprise later; marked optional, because it is.
  { icon: Sparkles, label: 'Optional: an AI that drafts the plan for you' },
];

/**
 * The first run: one screen, saying what the app is for.
 *
 * It used to be four — a pitch about planning in parts of the day, a list
 * of what the app is and is not, an AI key form, and a "you're set" — when
 * the real use is simpler: everything about a trip, kept in one place. The
 * rest is still there, in Settings, for whoever wants it; the AI key in
 * particular is optional, and asking for it up front said otherwise.
 */
export default function Onboarding({ onClose }: Props) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  const finish = (then?: () => void) => {
    setOnboarded();
    onClose();
    then?.();
  };

  // Escape skips it, like every other dismissible layer. An introduction, not a gate.
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The seeded sample trip, if it is still there, is the quickest way to see it.
  const demoId = (() => {
    try { return localStorage.getItem(DEMO_PLAN_ID); } catch { return null; }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-glass overlay-enter" data-testid="onboarding">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative w-full max-w-sm bg-surface-overlay border border-white/10 rounded-modal shadow-glass p-6 focus:outline-none panel-enter"
        data-testid="onboarding-welcome"
      >
        <button
          type="button"
          onClick={() => finish()}
          className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-lg text-ink-muted hover:text-ink-primary hover:bg-white/5"
          aria-label="Close"
          data-testid="onboarding-skip"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <h2 id="onboarding-title" className="text-xl font-bold text-ink-primary tracking-tight pr-8">
          Your whole trip, in one place
        </h2>

        <ul className="mt-5 space-y-3">
          {KEEPS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-ink-primary">
              <span className="w-9 h-9 shrink-0 grid place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden="true">
                <Icon size={18} />
              </span>
              {label}
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs text-ink-muted" data-testid="onboarding-privacy">
          Saved in this browser. No account needed.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => finish(() => navigate('/plan/new'))}
            className="w-full bg-accent hover:bg-accent-light text-ink-inverse font-semibold py-2.5 rounded-xl transition-colors"
            data-testid="onboarding-create-plan"
          >
            Start a trip
          </button>
          {demoId && (
            <button
              onClick={() => finish(() => navigate(`/plan/${demoId}/itinerary`))}
              className="w-full py-2.5 rounded-xl text-sm text-ink-secondary hover:text-ink-primary hover:bg-white/5"
              data-testid="onboarding-see-sample"
            >
              See a sample trip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
