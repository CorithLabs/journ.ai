import { useState } from 'react';
import { AlertTriangle, Pin, Pencil, Trash2, MapPin } from 'lucide-react';
import { type Activity, type Plan } from '../../db';
import { formatTime } from '../../utils/activityTime';
import { mapsUrlFor } from '../../utils/mapsLink';

interface Props {
  act: Activity;
  plan: Pick<Plan, 'destination' | 'country'>;
  onDel: () => void;
  onUpd: (u: Partial<Activity>) => void;
  onPin: () => void;
}

export default function ActivityCard({ act, plan, onDel, onUpd, onPin }: Props) {
  const mapsUrl = act.locationName?.trim() || act.coordinates ? mapsUrlFor(act, plan) : null;
  const [ed, setEd] = useState(false);
  const [nm, setNm] = useState(act.name);
  const [tm, setTm] = useState(act.time);
  const [loc, setLoc] = useState(act.locationName);
  const [notes, setNotes] = useState(act.notes);
  const [err, setErr] = useState('');

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
        <div className="flex gap-2">
          <input type="time" value={tm} onChange={e => setTm(e.target.value)} onBlur={save}
            className="bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none"
            aria-label="Time" />
          <input value={loc} onChange={e => setLoc(e.target.value)} onBlur={save}
            className="flex-1 bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none"
            aria-label="Location" placeholder="Location" />
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={save} rows={2}
          className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none resize-none"
          aria-label="Notes" placeholder="Notes" />
        <button className="text-xs text-accent hover:underline" onClick={() => setEd(false)}>Done</button>
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
            className="shrink-0 text-[11px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full tabular-nums"
            data-testid="activity-time"
          >
            {formatTime(act.time)}
          </span>
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

      {/* Binder edge: a rail of actions down the card's right side. */}
      <div
        className="shrink-0 flex flex-col justify-center gap-0.5 px-1 py-1 border-l border-white/10 bg-surface-base/30"
        data-testid="activity-actions"
      >
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
        <button
          onClick={onPin}
          className={`p-2 rounded-lg hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none ${act.pinnedToTodo ? 'text-accent' : 'text-ink-muted hover:text-ink-primary'}`}
          aria-label={act.pinnedToTodo ? 'Unpin from to-do' : 'Pin to to-do'}
          title={act.pinnedToTodo ? 'Unpin' : 'Pin to to-do'}
        >
          <Pin size={16} />
        </button>
        <button
          onClick={() => setEd(true)}
          className="p-2 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label="Edit activity"
          title="Edit"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={onDel}
          className="p-2 rounded-lg text-ink-muted hover:text-status-danger hover:bg-status-danger/10 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label="Delete activity"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
