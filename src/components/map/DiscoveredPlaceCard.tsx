import { useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import type { Plan } from '../../db';
import type { DiscoveredPlace } from '../../services/discover';
import { relativeDayLabel } from '../../utils/tripDay';

/**
 * A place found on the map, and the one thing you can do with it.
 *
 * Shown before anything is added rather than after: a tap that silently put
 * something in a day would mean reading the itinerary to find out what you had
 * just done. What it shows is deliberately thin — a name, what kind of thing
 * it is, and where. No hours, no prices, no ratings; the app promises not to
 * be a live service, and stale opening times are exactly the promise that
 * would break.
 */
export default function DiscoveredPlaceCard({
  place,
  plan,
  onAdd,
  onClose,
}: {
  place: DiscoveredPlace;
  plan: Plan;
  onAdd: (dayIndex: number) => void;
  onClose: () => void;
}) {
  const [choosing, setChoosing] = useState(false);

  return (
    <div
      className="rounded-card border border-white/10 bg-surface-overlay shadow-glass p-3 panel-enter"
      data-testid="discovered-card"
    >
      <div className="flex items-start gap-2">
        <MapPin size={14} className="text-status-success shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-primary break-words">{place.name}</p>
          {place.kind && (
            <p className="text-xs text-ink-muted capitalize mt-0.5">{place.kind}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 -mr-1 -mt-1 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label="Close"
          data-testid="discovered-close"
        >
          <X size={14} />
        </button>
      </div>

      {choosing ? (
        <div className="mt-3" data-testid="discovered-day-picker">
          <p className="text-xs text-ink-secondary mb-1.5">Add to which day?</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {plan.itinerary.map((day) => {
              const relative = relativeDayLabel(plan.startDate, day.dayIndex);
              return (
                <button
                  key={day.dayIndex}
                  onClick={() => onAdd(day.dayIndex)}
                  className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded-lg border border-white/10 text-sm text-ink-primary hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
                  data-testid={`discovered-add-day-${day.dayIndex}`}
                >
                  <span className="truncate">{day.label}</span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {/* Today and tomorrow are worth naming; the rest are not. */}
                    {relative ?? `${day.activities.length} planned`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setChoosing(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-status-success/40 text-status-success hover:bg-status-success/10 transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            data-testid="discovered-add"
          >
            <Plus size={14} aria-hidden="true" /> Add to day…
          </button>
        </div>
      )}
    </div>
  );
}
