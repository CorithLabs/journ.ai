import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { searchVenues, type VenueSuggestion } from '../../services/venues';
import { fieldClass } from './formStyles';

export interface PickedLocation {
  locationName: string;
  address?: string;
  coordinates?: [number, number];
}

interface Props {
  value: string;
  /**
   * Called on every change. A picked venue arrives with its address and
   * coordinates; a typed one arrives with neither, which is the signal to
   * throw away whatever the old text had resolved to.
   */
  onChange: (next: PickedLocation) => void;
  /** Bias the search toward the city this activity belongs to. */
  proximity?: [number, number];
  /** Appended to the query, e.g. "Tokyo, Japan". */
  context?: string;
  /** The address already resolved for this location, shown under the field. */
  address?: string;
  onBlur?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  testId?: string;
}

/**
 * The location field, with the venues behind it.
 *
 * Typing a restaurant name and leaving it to be geocoded later means accepting
 * whichever place of that name ranks highest — one of eighty Ichiran branches,
 * or a Union Station on the wrong continent. Picking from the list settles it
 * now, and hands over exact coordinates so nothing is guessed at afterwards.
 *
 * Typing still works, and works alone: with no Mapbox token the list is simply
 * never offered and this is an ordinary text input.
 */
export default function LocationField({
  value,
  onChange,
  proximity,
  context,
  address,
  onBlur,
  autoFocus,
  placeholder = 'Location — a venue, an address, a neighbourhood',
  testId = 'location-field',
}: Props) {
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [searching, setSearching] = useState(false);
  const skipNextSearch = useRef(false);

  // Debounced, and superseded keystrokes are aborted — without that, responses
  // arrive out of order and the list flashes results for a prefix the user has
  // already typed past.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      const hits = await searchVenues(q, { proximity, context, signal: controller.signal });
      if (!controller.signal.aborted) {
        setSuggestions(hits);
        setHighlighted(-1);
        setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // proximity is a fresh array each render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, proximity?.[0], proximity?.[1], context]);

  const pick = (v: VenueSuggestion) => {
    // Otherwise setting the field re-runs the search and the list reopens
    // under the cursor immediately after being chosen from.
    skipNextSearch.current = true;
    onChange({ locationName: v.name, address: v.address, coordinates: v.coordinates });
    setSuggestions([]);
    setOpen(false);
    setHighlighted(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      // Only when an option is actively highlighted, so Enter still submits
      // the form the rest of the time.
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          /*
           * Typed text drops the resolved address and coordinates.
           *
           * They belong to the old text. Editing "Shibuya" to "Asakusa" and
           * keeping the pin left the card claiming one place and shown at
           * another, with no way to tell from looking at it.
           */
          onChange({ locationName: e.target.value });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on an option registers before the list closes.
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Location"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${testId}-options`}
        aria-autocomplete="list"
        autoComplete="off"
        className={fieldClass}
        data-testid={testId}
      />

      {/* What the coordinates actually point at, so a wrong match is visible
          rather than hiding behind a pin on a tab the user may never open. */}
      {address && address !== value && !showList && (
        <p className="text-xs text-ink-muted mt-1 break-words" data-testid={`${testId}-address`}>
          {address}
        </p>
      )}

      {searching && !showList && value.trim().length >= 2 && (
        <p className="text-xs text-ink-muted mt-1" data-testid={`${testId}-searching`}>
          Looking for places…
        </p>
      )}

      {showList && (
        <ul
          id={`${testId}-options`}
          role="listbox"
          className="absolute z-10 mt-1 w-full bg-surface-overlay border border-white/10 rounded-card shadow-glass overflow-hidden max-h-56 overflow-y-auto"
          data-testid={`${testId}-suggestions`}
        >
          {suggestions.map((v, n) => (
            <li key={`${v.name}-${n}`} role="option" aria-selected={n === highlighted}>
              <button
                type="button"
                // onMouseDown beats the input's blur, so the pick is not
                // cancelled by the list closing first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(v);
                }}
                onMouseEnter={() => setHighlighted(n)}
                className={`w-full flex items-start gap-2 text-left px-3 py-2 transition-colors ${
                  n === highlighted ? 'bg-accent/15' : 'hover:bg-surface-raised'
                }`}
                data-testid={`${testId}-option-${n}`}
              >
                <MapPin size={14} className="text-accent shrink-0 mt-0.5" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm text-ink-primary truncate">{v.name}</span>
                  {v.address && v.address !== v.name && (
                    <span className="block text-xs text-ink-secondary truncate">{v.address}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
