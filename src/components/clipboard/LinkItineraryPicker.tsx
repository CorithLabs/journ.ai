import { useState } from 'react';
import { slotLabel } from '../../utils/activityTime';
import { X } from 'lucide-react';
import type { Plan } from '../../db';
import { fieldClass } from '../ui/formStyles';

interface Props {
  plan: Plan;
  onClose: () => void;
  onLink: (dayIndex: number, activityId?: string) => void;
}

/**
 * Two-step picker: choose a day, then optionally a specific activity within
 * that day. Confirming links the clipboard item to { dayIndex, activityId }.
 */
export default function LinkItineraryPicker({ plan, onClose, onLink }: Props) {
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [activityId, setActivityId] = useState<string>('');

  const selectedDay =
    dayIndex !== null ? plan.itinerary.find((d) => d.dayIndex === dayIndex) : undefined;

  const confirm = () => {
    if (dayIndex === null) return;
    onLink(dayIndex, activityId || undefined);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Link to itinerary"
    >
      <button className="absolute inset-0 bg-black/50 overlay-enter" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-overlay border border-white/10 rounded-modal shadow-glass p-5 panel-enter">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink-primary">Link to itinerary</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-ink-muted hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {plan.itinerary.length === 0 ? (
          <p className="text-sm text-ink-muted">
            This plan has no itinerary days yet. Generate an itinerary first.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="link-day" className="block text-sm text-ink-secondary mb-1.5">
                Day
              </label>
              <select
                id="link-day"
                value={dayIndex ?? ''}
                onChange={(e) => {
                  setDayIndex(e.target.value === '' ? null : Number(e.target.value));
                  setActivityId('');
                }}
                data-testid="link-day-select"
                className={fieldClass}
              >
                <option value="">Select a day…</option>
                {plan.itinerary.map((d) => (
                  <option key={d.dayIndex} value={d.dayIndex}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {selectedDay && (
              <div>
                <label htmlFor="link-activity" className="block text-sm text-ink-secondary mb-1.5">
                  Activity <span className="text-ink-muted">(optional)</span>
                </label>
                <select
                  id="link-activity"
                  value={activityId}
                  onChange={(e) => setActivityId(e.target.value)}
                  data-testid="link-activity-select"
                  className={fieldClass}
                >
                  <option value="">Whole day</option>
                  {selectedDay.activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {slotLabel(a.time)} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={confirm}
              disabled={dayIndex === null}
              data-testid="confirm-link-btn"
              className="w-full bg-accent hover:bg-accent-light disabled:opacity-60 text-ink-inverse font-semibold py-2 rounded-xl text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            >
              Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
