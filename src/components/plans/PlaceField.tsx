import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { searchDestinations, type DestinationSuggestion } from '../../services/destinations';
import { fieldClass } from '../ui/formStyles';

interface Props {
  id: string;
  value: string;
  onChange: (text: string) => void;
  onPick: (s: DestinationSuggestion) => void;
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
  testId: string;
}

/**
 * A city, typed with suggestions: the trip's From and its To.
 *
 * The lookup is debounced and the abort drops answers to superseded
 * keystrokes, which otherwise arrive out of order and flash stale options.
 */
export default function PlaceField({ id, value, onChange, onPick, placeholder, invalid, describedBy, testId }: Props) {
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const skipNextSearch = useRef(false);
  const listId = `${id}-suggestions`;

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const q = value.trim();
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
  }, [value]);

  const pick = (s: DestinationSuggestion) => {
    // Choosing an option must not search again and reopen the list under the finger.
    skipNextSearch.current = true;
    onPick(s);
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
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        // Delayed so a tap on an option lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`${fieldClass} text-base md:text-sm`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        data-testid={testId}
      />
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full bg-surface-overlay border border-white/10 rounded-card shadow-glass overflow-hidden max-h-64 overflow-y-auto"
          data-testid={`${testId.replace(/-input$/, '')}-suggestions`}
        >
          {suggestions.map((s, n) => (
            <li key={`${s.label}-${n}`} role="option" aria-selected={n === highlighted}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setHighlighted(n)}
                className={`w-full flex items-center gap-2 text-left px-3 py-3 text-sm transition-colors ${
                  n === highlighted ? 'bg-accent/15 text-ink-primary' : 'text-ink-secondary hover:bg-surface-raised'
                }`}
                data-testid={`${testId.replace(/-input$/, '')}-option-${n}`}
              >
                <MapPin size={14} className="text-accent shrink-0" aria-hidden="true" />
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
