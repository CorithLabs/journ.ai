import { useState } from 'react';
import Button from '../ui/Button';
import { AlertTriangle, Pin, Pencil, Trash2, MapPin } from 'lucide-react';
import { type Activity, type Plan } from '../../db';
import {
  formatTime,
  slotLabel,
  slotForTime,
  exactTime,
  TIME_SLOTS,
  findTimeClashes,
  nextFreeTime,
} from '../../utils/activityTime';
import { mapsUrlFor } from '../../utils/mapsLink';
import { CardActionRail, CardAction } from '../ui/CardActionRail';

/** Morning / Noon / Evening / Night, with the current one lit. */
export function SlotPicker({ value, onPick }: { value: string; onPick: (t: string) => void }) {
  // An exact time lights its own slot, so 15:00 shows as Noon and tapping
  // Noon simply drops the clock value.
  const current = slotForTime(value);
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Time of day">
      {TIME_SLOTS.map(slot => (
        <button
          key={slot.id}
          type="button"
          title={slot.hint}
          onClick={() => onPick(slot.id)}
          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
            current === slot.id
              ? 'bg-accent/15 border-accent/40 text-ink-primary'
              : 'border-white/10 text-ink-secondary hover:text-ink-primary'
          }`}
          aria-pressed={current === slot.id}
          data-testid={`slot-${slot.id}`}
        >
          {slot.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  act: Activity;
  /** The rest of the day, for spotting two activities at the same clock time. */
  siblings?: Activity[];
  plan: Pick<Plan, 'destination' | 'country'>;
  onDel: () => void;
  onUpd: (u: Partial<Activity>) => void;
  onPin: () => void;
}

export default function ActivityCard({ act, plan, siblings = [], onDel, onUpd, onPin }: Props) {
  const mapsUrl = act.locationName?.trim() || act.coordinates ? mapsUrlFor(act, plan) : null;
  const [ed, setEd] = useState(false);
  const [nm, setNm] = useState(act.name);
  const [tm, setTm] = useState(act.time);
  const [loc, setLoc] = useState(act.locationName);
  const [notes, setNotes] = useState(act.notes);
  const [err, setErr] = useState('');
  // The clock is the exception now, so it stays out of the way unless this
  // activity already has one or the user asks for it.
  const [showExact, setShowExact] = useState(Boolean(exactTime(act.time)));

  const clashes = findTimeClashes(siblings, tm, act.id);
  const suggestion = clashes.length ? nextFreeTime(siblings, tm, act.id) : null;


  const save = () => {
    if (!nm.trim()) { setErr('Name cannot be blank'); return; }
    setErr('');
    onUpd({ name: nm.trim(), time: tm, locationName: loc, notes });
  };

  if (ed) {
    return (
      <div className="bg-surface-overlay border border-accent/30 rounded-card p-3 space-y-2">
        <div>
          <input value={nm} onChange={e => setNm(e.target.value)} onBlur={save}
            className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
            aria-label="Activity name" placeholder="Activity name" />
          {err && <p className="text-xs text-status-danger mt-0.5">{err}</p>}
        </div>
        <input value={loc} onChange={e => setLoc(e.target.value)} onBlur={save}
          className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none"
          aria-label="Location" placeholder="Location" />

        {/* The part of the day is the time. An exact clock value is available
            below for the few things that have one — a check-in, a flight. */}
        <SlotPicker
          value={tm}
          onPick={next => { setTm(next); onUpd({ time: next }); }}
        />

        {showExact ? (
          <div className="flex items-center gap-2">
            <input type="time" value={exactTime(tm) ?? ''} onChange={e => setTm(e.target.value)} onBlur={save}
              className="bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none"
              aria-label="Exact time" data-testid="edit-time" />
            <button type="button" className="text-xs text-ink-muted hover:underline"
              onClick={() => { setShowExact(false); const slot = slotForTime(tm); if (slot) { setTm(slot); onUpd({ time: slot }); } }}>
              Clear
            </button>
          </div>
        ) : (
          <button type="button" className="text-xs text-ink-muted hover:text-accent"
            onClick={() => setShowExact(true)} data-testid="show-exact-time">
            + Exact time
          </button>
        )}

        {clashes.length > 0 && (
          <p className="text-xs text-status-warning" role="alert" data-testid="time-clash">
            {clashes.length === 1
              ? `"${clashes[0].name}" is already at ${formatTime(tm)}.`
              : `${clashes.length} other activities are already at ${formatTime(tm)}.`}
            {suggestion && (
              <>
                {' '}
                <button
                  type="button"
                  className="underline text-accent"
                  onClick={() => { setTm(suggestion); onUpd({ time: suggestion }); }}
                  data-testid="use-free-time"
                >
                  Use {formatTime(suggestion)} instead
                </button>
              </>
            )}
          </p>
        )}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={save} rows={2}
          className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none resize-none"
          aria-label="Notes" placeholder="Notes" />
        {/* Was a text link reading "Done", which named the moment rather
            than the action and looked like nothing else that commits. */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => { save(); setEd(false); }} data-testid="activity-save-btn">Save</Button>
          <Button size="sm" variant="secondary" onClick={() => setEd(false)} data-testid="activity-cancel-btn">Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group card-surface flex items-stretch rounded-card overflow-hidden"
      data-testid="activity-card"
    >
      {/* Details take the full width of the card body. Actions live on the
          edge rail, so the name no longer competes with three buttons for
          room — "Visit to Royal Museum" was truncating to "Visit to Royal Mu". */}
      <div className="flex-1 min-w-0 p-3">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="shrink-0 text-[11px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full"
            data-testid="activity-time"
          >
            {slotLabel(act.time)}
          </span>
          {/* Kept beside the slot rather than replaced by it: a 3pm check-in
              belongs to Noon, but 3pm is still the thing you must not miss. */}
          {exactTime(act.time) && (
            <span className="shrink-0 text-[11px] text-ink-muted tabular-nums" data-testid="activity-exact-time">
              {formatTime(act.time)}
            </span>
          )}
          {act.budgetWarning && (
            <AlertTriangle size={12} className="text-status-warning shrink-0" aria-label="Budget warning" />
          )}
          {act.pinnedToTodo && (
            <span className="text-[10px] text-accent" data-testid="pinned-flag">Pinned</span>
          )}
        </div>

        {/* Wraps rather than truncating: the name is the one thing the user
            is scanning for. */}
        <p className="text-sm font-medium text-ink-primary leading-snug break-words">
          {act.name}
        </p>

        {act.locationName && (
          <p className="text-xs text-ink-muted mt-0.5 break-words">{act.locationName}</p>
        )}
        {act.notes && (
          <p className="text-xs text-ink-secondary mt-1 line-clamp-3 break-words">{act.notes}</p>
        )}
      </div>

      {/* The same rail the to-do and clipboard cards use. */}
      <CardActionRail testId="activity-actions">
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-ink-muted hover:text-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label={`Open ${act.name} in Google Maps`}
            title="Open in Google Maps"
            data-testid="activity-maps"
          >
            <MapPin size={16} />
          </a>
        )}
        <CardAction
          icon={<Pin size={16} />}
          label={act.pinnedToTodo ? 'Unpin from to-do' : 'Pin to to-do'}
          onClick={onPin}
          active={act.pinnedToTodo}
        />
        <CardAction icon={<Pencil size={16} />} label="Edit activity" onClick={() => setEd(true)} />
        <CardAction icon={<Trash2 size={16} />} label="Delete activity" onClick={onDel} tone="danger" />
      </CardActionRail>
    </div>
  );
}
