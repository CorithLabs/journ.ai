import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin } from 'lucide-react';
import { db, type Plan, type TripLeg, type TripStop } from '../../db';
import { LegFields, StopsFields, BorderPicker } from './TripDetailsFields';
import { MAX_TRIP_DAYS_ERROR, exceedsMaxTripDays, maxEndDate } from '../../utils/tripDuration';
import {
  searchDestinations,
  isPlausibleDestination,
  DESTINATION_ERROR,
  type DestinationSuggestion,
} from '../../services/destinations';

const input =
  'w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm';

/**
 * Everything about a trip, after it exists.
 *
 * All of this was write-once: the only thing that could be changed afterwards
 * was the name, through a window.prompt that overwrote the destination without
 * re-resolving its country — silently repointing the map's anchors and the
 * visa to-do at a place that may not geocode at all. Dates, travel mode,
 * arrival, departure and the route could not be corrected without deleting the
 * plan and starting again.
 */
export default function TripDetailsPanel({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [destination, setDestination] = useState(plan.destination);
  const [country, setCountry] = useState<string | null>(plan.country ?? null);
  const [startDate, setStartDate] = useState(plan.startDate);
  const [endDate, setEndDate] = useState(plan.endDate);
  const [arrival, setArrival] = useState<TripLeg>(plan.arrival ?? {});
  const [departure, setDeparture] = useState<TripLeg>(plan.departure ?? {});
  const [stops, setStops] = useState<TripStop[]>(plan.stops ?? []);
  const [international, setInternational] = useState<boolean | null>(plan.international ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const skipNextSearch = useRef(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (skipNextSearch.current) { skipNextSearch.current = false; return; }
    const q = destination.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const hits = await searchDestinations(q, controller.signal);
      if (!controller.signal.aborted) setSuggestions(hits);
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [destination]);

  const pick = (s: DestinationSuggestion) => {
    skipNextSearch.current = true;
    setDestination(s.label);
    setCountry(s.country);
    setSuggestions([]);
    setShowSuggestions(false);
    setError('');
  };

  const tooLong = exceedsMaxTripDays(startDate, endDate);
  const endBeforeStart = !!(startDate && endDate && endDate < startDate);

  const save = async () => {
    const name = destination.trim();
    if (!name) return setError('Destination is required');
    if (!isPlausibleDestination(name)) return setError(DESTINATION_ERROR);
    if (endBeforeStart) return setError('End date must be after start date');
    if (tooLong) return setError(MAX_TRIP_DAYS_ERROR);

    const clean = (leg: TripLeg): TripLeg | undefined => {
      const kept = Object.fromEntries(
        Object.entries(leg).filter(([, v]) => v !== undefined && v !== ''),
      ) as TripLeg;
      return Object.keys(kept).length ? kept : undefined;
    };

    setSaving(true);
    try {
      await db.plans.update(plan.id, {
        name,
        destination: name,
        // Cleared rather than left behind when the destination changes and no
        // suggestion was picked: a stale country is worse than none, since it
        // is what the visa to-do and the map's anchors are built from.
        country: country ?? undefined,
        startDate,
        endDate,
        arrival: clean(arrival),
        departure: clean(departure),
        stops: stops.filter((s) => s.city.trim()).map((s) => ({ ...s, city: s.city.trim() })),
        international: international ?? undefined,
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  /*
   * Rendered into the body rather than where it is called from.
   *
   * This opens from the plan name in the tab bar, which carries
   * backdrop-blur — and backdrop-filter creates a stacking context, so a
   * fixed child is confined to it however high its z-index goes. The panel
   * was painting underneath the itinerary because the bar paints before the
   * tab content that follows it. A portal leaves that context entirely.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-glass"
      data-testid="trip-details-panel"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-details-title"
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-surface-overlay border border-white/10 rounded-modal shadow-glass p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="trip-details-title" className="text-lg font-semibold text-ink-primary">Trip details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary" aria-label="Close trip details">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="td-destination" className="block text-sm text-ink-secondary mb-1">Destination</label>
            <div className="relative">
              <input
                id="td-destination"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  // A hand-edit invalidates the country from any earlier pick,
                  // which is exactly what renaming used to leave stale.
                  setCountry(null);
                  setShowSuggestions(true);
                  setError('');
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className={input}
                autoComplete="off"
                data-testid="td-destination"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-surface-overlay border border-white/10 rounded-card shadow-glass max-h-56 overflow-y-auto" role="listbox">
                  {suggestions.map((s, n) => (
                    <li key={`${s.label}-${n}`} role="option" aria-selected={false}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-ink-secondary hover:bg-surface-raised"
                        data-testid={`td-destination-option-${n}`}
                      >
                        <MapPin size={14} className="text-accent shrink-0" aria-hidden="true" />
                        <span className="truncate">{s.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {country ? `Country: ${country}` : 'Pick a suggestion to set the country — it drives the map and entry requirements.'}
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="td-start" className="block text-sm text-ink-secondary mb-1">Start</label>
              <input id="td-start" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setError(''); }} className={input} data-testid="td-start" />
            </div>
            <div className="flex-1">
              <label htmlFor="td-end" className="block text-sm text-ink-secondary mb-1">End</label>
              <input id="td-end" type="date" value={endDate} min={startDate || undefined} max={maxEndDate(startDate) || undefined} onChange={(e) => { setEndDate(e.target.value); setError(''); }} className={input} data-testid="td-end" />
            </div>
          </div>

          {/* Days already in the itinerary are not rewritten by a date change:
              silently deleting a day the user had filled in would be worse
              than a range that no longer lines up. */}
          {(startDate !== plan.startDate || endDate !== plan.endDate) && plan.itinerary.length > 0 && (
            <p className="text-xs text-status-warning" role="status" data-testid="td-dates-warning">
              Changing the dates does not move the days already in your itinerary. You may need to
              add or remove days afterwards.
            </p>
          )}

          <div>
            <p className="block text-sm text-ink-secondary mb-1.5">Trip type</p>
            <BorderPicker value={international} onChange={setInternational} />
          </div>

          <div className="border-t border-white/5 pt-3 space-y-4">
            <LegFields id="td-arrival" legend="Arrival" value={arrival} onChange={setArrival} cityPlaceholder={destination.trim() || 'City you arrive in'} />
            <LegFields id="td-departure" legend="Departure" value={departure} onChange={setDeparture} cityPlaceholder={destination.trim() || 'City you leave from'} />
          </div>

          <div className="border-t border-white/5 pt-3">
            <p className="block text-sm text-ink-secondary mb-1.5">More cities</p>
            <StopsFields stops={stops} onChange={setStops} />
          </div>

          {error && <p role="alert" className="text-xs text-status-danger" data-testid="td-error">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="flex-1 bg-accent hover:bg-accent-light disabled:opacity-60 text-ink-inverse font-semibold py-2.5 rounded-xl text-sm" data-testid="td-save">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-ink-secondary border border-white/10 hover:text-ink-primary" data-testid="td-cancel">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
