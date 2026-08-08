import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { TravelMode, TripLeg, TripStop } from '../../db';
import { TRAVEL_MODES } from '../../utils/travel';

const input =
  'w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm';

function ModePicker({
  value, onChange, id,
}: {
  value: TravelMode | undefined;
  onChange: (m: TravelMode) => void;
  id: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="How you are travelling">
      {TRAVEL_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
            value === m.id
              ? 'bg-accent/15 border-accent/40 text-ink-primary'
              : 'border-white/10 text-ink-secondary hover:text-ink-primary'
          }`}
          data-testid={`${id}-mode-${m.id}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Arrival or departure: how, where, and when. */
export function LegFields({
  id, legend, value, onChange, cityPlaceholder, dateHint,
}: {
  id: string;
  legend: string;
  value: TripLeg;
  onChange: (leg: TripLeg) => void;
  cityPlaceholder: string;
  dateHint?: string;
}) {
  const set = (patch: Partial<TripLeg>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-ink-secondary mb-1">{legend}</legend>
      <ModePicker id={id} value={value.mode} onChange={(mode) => set({ mode })} />
      <input
        type="text"
        value={value.city ?? ''}
        onChange={(e) => set({ city: e.target.value })}
        placeholder={cityPlaceholder}
        aria-label={`${legend} city`}
        className={input}
        data-testid={`${id}-city`}
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={value.date ?? ''}
          onChange={(e) => set({ date: e.target.value })}
          aria-label={`${legend} date`}
          className={input}
          data-testid={`${id}-date`}
        />
        <input
          type="time"
          value={value.time ?? ''}
          onChange={(e) => set({ time: e.target.value })}
          aria-label={`${legend} time`}
          className={`${input} w-32`}
          data-testid={`${id}-time`}
        />
      </div>
      {dateHint && <p className="text-xs text-ink-muted">{dateHint}</p>}
    </fieldset>
  );
}

/**
 * Further cities, in visit order.
 *
 * Nights rather than dates: on a multi-city trip people know they want three
 * nights in Kyoto long before they know which three, and asking for dates
 * that have to stay consistent with each other is a worse question.
 */
export function StopsFields({
  stops, onChange,
}: {
  stops: TripStop[];
  onChange: (stops: TripStop[]) => void;
}) {
  const update = (id: string, patch: Partial<TripStop>) =>
    onChange(stops.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-2">
      {stops.map((stop, i) => (
        <div key={stop.id} className="flex gap-2 items-start">
          <input
            type="text"
            value={stop.city}
            onChange={(e) => update(stop.id, { city: e.target.value })}
            placeholder="City"
            aria-label={`City ${i + 2}`}
            className={input}
            data-testid={`stop-city-${i}`}
          />
          <input
            type="number"
            min={1}
            value={stop.nights ?? ''}
            onChange={(e) => update(stop.id, { nights: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Nights"
            aria-label={`Nights in city ${i + 2}`}
            className={`${input} w-24`}
            data-testid={`stop-nights-${i}`}
          />
          <button
            type="button"
            onClick={() => onChange(stops.filter((s) => s.id !== stop.id))}
            className="p-2 rounded-lg text-ink-muted hover:text-status-danger shrink-0"
            aria-label={`Remove city ${i + 2}`}
            data-testid={`stop-remove-${i}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...stops, { id: uuidv4(), city: '' }])}
        className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent py-1"
        data-testid="add-stop"
      >
        <Plus size={12} aria-hidden="true" /> Add another city
      </button>
    </div>
  );
}

/**
 * Whether the trip crosses a border.
 *
 * The only honest basis for an entry-requirement to-do: it cannot be read off
 * the transport mode, since a train crosses borders and plenty of flights do
 * not, and the app never learns where the traveller lives.
 */
export function BorderPicker({
  value, onChange,
}: {
  value: boolean | null | undefined;
  onChange: (v: boolean | null) => void;
}) {
  const options: Array<{ v: boolean | null; label: string; id: string }> = [
    { v: false, label: 'Domestic', id: 'domestic' },
    { v: true, label: 'International', id: 'international' },
    { v: null, label: 'Not sure', id: 'unsure' },
  ];
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Does this trip cross a border?">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
            value === o.v
              ? 'bg-accent/15 border-accent/40 text-ink-primary'
              : 'border-white/10 text-ink-secondary hover:text-ink-primary'
          }`}
          data-testid={`border-${o.id}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
