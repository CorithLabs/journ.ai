import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import type { Plan } from '../../db';
import { X, MapPin, AlertTriangle } from 'lucide-react';
import { hasAnyAiKey, NO_AI_KEY_MESSAGE } from '../../services/aiKeyStatus';
import {
  MAX_TRIP_DAYS,
  MAX_TRIP_DAYS_ERROR,
  exceedsMaxTripDays,
  maxEndDate,
} from '../../utils/tripDuration';
import {
  searchDestinations,
  isPlausibleDestination,
  DESTINATION_ERROR,
  type DestinationSuggestion,
} from '../../services/destinations';

interface Props {
  onClose: () => void;
}

export default function NewPlanModal({ onClose }: Props) {
  const navigate = useNavigate();
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Country comes from the picked suggestion. Cleared whenever the field is
  // edited by hand, so it can never disagree with the destination text.
  const needsKey = !hasAnyAiKey();

  const [country, setCountry] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const skipNextSearch = useRef(false);

  // Debounced lookup. The abort controller drops responses from superseded
  // keystrokes, which otherwise arrive out of order and flash stale options.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const q = destination.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const hits = await searchDestinations(q, controller.signal);
      if (!controller.signal.aborted) {
        setSuggestions(hits);
        setHighlighted(-1);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destination]);

  const pick = (s: DestinationSuggestion) => {
    // Suppress the search this setState would otherwise trigger, so choosing an
    // option doesn't immediately reopen the dropdown under the cursor.
    skipNextSearch.current = true;
    setDestination(s.label);
    setCountry(s.country);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlighted(-1);
    setErrors((prev) => ({ ...prev, destination: '' }));
  };

  const onDestinationKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      // Only intercept Enter when an option is actively highlighted, so the
      // form still submits normally otherwise.
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Trip length must be <= MAX_TRIP_DAYS. Computed live so the Create button
  // and inline error react immediately to any date change.
  const tooLong = exceedsMaxTripDays(startDate, endDate);
  const endBeforeStart = !!(startDate && endDate && endDate < startDate);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!destination.trim()) {
      errs.destination = 'Destination is required';
    } else if (!isPlausibleDestination(destination)) {
      // Guards "12345" being accepted as a city, which produces a nonsense
      // itinerary prompt and an unmappable plan.
      errs.destination = DESTINATION_ERROR;
    }
    if (endBeforeStart) {
      errs.endDate = 'End date must be after start date';
    } else if (tooLong) {
      errs.endDate = MAX_TRIP_DAYS_ERROR;
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const plan: Plan = {
        id: uuidv4(),
        name: destination.trim(),
        destination: destination.trim(),
        ...(country ? { country } : {}),
        startDate: startDate || now.split('T')[0],
        endDate: endDate || now.split('T')[0],
        createdAt: now,
        updatedAt: now,
        deleted: false,
        itinerary: [],
      };
      await db.plans.add(plan);
      navigate(`/plan/${plan.id}/itinerary`);
    } finally {
      setSaving(false);
    }
  };

  // The end-date error shown inline: prefer the "end before start" message,
  // then the length cap, then any error set by submit-time validation.
  const endDateError =
    (endBeforeStart ? 'End date must be after start date' : '') ||
    (tooLong ? MAX_TRIP_DAYS_ERROR : '') ||
    errors.endDate ||
    '';

  return (
    <div
      className="w-full max-w-md bg-surface-overlay border border-white/10 rounded-modal shadow-glass p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-plan-title"
      data-testid="new-plan-modal"
    >
      <div className="flex items-center justify-between mb-5">
        <h2
          id="new-plan-title"
          className="text-lg font-semibold text-ink-primary"
        >
          New Trip
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-raised transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label="Close modal"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {/* A nudge, not a wall. Without a key the AI paths are unavailable, but
          the itinerary can still be built by hand — so creating the plan is
          worthwhile, and blocking it would make the app look broken rather
          than unconfigured. */}
      {needsKey && (
        <div
          role="status"
          className="flex items-start gap-2 mb-4 p-3 bg-status-warning/10 border border-status-warning/20 rounded-xl"
          data-testid="new-plan-needs-key"
        >
          <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm text-status-warning">{NO_AI_KEY_MESSAGE}</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/settings');
              }}
              className="mt-1.5 text-xs text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none rounded"
              data-testid="new-plan-goto-settings"
            >
              Go to Settings →
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="destination"
            className="block text-sm text-ink-secondary mb-1"
          >
            Destination <span className="text-status-danger">*</span>
          </label>
          <div className="relative">
            <input
              id="destination"
              type="text"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                // A hand-edit invalidates the country from any earlier pick.
                setCountry(null);
                setShowSuggestions(true);
                if (errors.destination) setErrors((prev) => ({ ...prev, destination: '' }));
              }}
              onFocus={() => setShowSuggestions(true)}
              // Delayed so a click on an option registers before the list closes.
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={onDestinationKeyDown}
              placeholder="e.g. Tokyo, Japan"
              className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
              aria-required="true"
              aria-describedby={errors.destination ? 'destination-error' : undefined}
              role="combobox"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-controls="destination-suggestions"
              aria-autocomplete="list"
              autoComplete="off"
              data-testid="destination-input"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul
                id="destination-suggestions"
                role="listbox"
                className="absolute z-10 mt-1 w-full bg-surface-overlay border border-white/10 rounded-xl shadow-glass overflow-hidden max-h-56 overflow-y-auto"
                data-testid="destination-suggestions"
              >
                {suggestions.map((s, n) => (
                  <li key={`${s.label}-${n}`} role="option" aria-selected={n === highlighted}>
                    <button
                      type="button"
                      // onMouseDown fires before the input's blur, so the pick
                      // isn't cancelled by the list closing first.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(s);
                      }}
                      onMouseEnter={() => setHighlighted(n)}
                      className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm transition-colors ${
                        n === highlighted
                          ? 'bg-accent/15 text-ink-primary'
                          : 'text-ink-secondary hover:bg-surface-raised'
                      }`}
                      data-testid={`destination-option-${n}`}
                    >
                      <MapPin size={14} className="text-accent shrink-0" aria-hidden="true" />
                      <span className="truncate">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {errors.destination && (
            <p
              id="destination-error"
              role="alert"
              className="mt-1 text-xs text-status-danger"
            >
              {errors.destination}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="start-date"
            className="block text-sm text-ink-secondary mb-1"
          >
            Start Date
          </label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: '' }));
            }}
            className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
            data-testid="start-date-input"
          />
        </div>

        <div>
          <label
            htmlFor="end-date"
            className="block text-sm text-ink-secondary mb-1"
          >
            End Date
          </label>
          <input
            id="end-date"
            type="date"
            value={endDate}
            // Constrain the picker itself rather than only reporting the
            // problem after the fact: dates beyond the cap aren't selectable,
            // and can't precede the start. The submit-time check stays as a
            // backstop for typed input, which browsers don't clamp.
            min={startDate || undefined}
            max={maxEndDate(startDate) || undefined}
            onChange={(e) => {
              setEndDate(e.target.value);
              if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: '' }));
            }}
            className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
            aria-describedby={
              endDateError ? 'end-date-error' : 'end-date-help'
            }
            data-testid="end-date-input"
          />
          {endDateError ? (
            <p
              id="end-date-error"
              role="alert"
              className="mt-1 text-xs text-status-danger"
              data-testid="end-date-error"
            >
              {endDateError}
            </p>
          ) : (
            <p id="end-date-help" className="mt-1 text-xs text-ink-muted">
              Up to {MAX_TRIP_DAYS} days supported
              {startDate ? ` — latest ${maxEndDate(startDate)}.` : '.'}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving || tooLong}
          className="w-full bg-accent hover:bg-accent-light disabled:opacity-60 disabled:cursor-not-allowed text-ink-inverse font-semibold px-4 py-2.5 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none text-sm"
          data-testid="create-plan-btn"
        >
          {saving ? 'Creating…' : 'Create Plan'}
        </button>
      </form>
    </div>
  );
}
