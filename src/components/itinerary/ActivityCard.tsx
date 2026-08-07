import { useState } from 'react';
import { AlertTriangle, Pin, Pencil, Trash2, GripVertical } from 'lucide-react';
import { type Activity } from '../../db';

interface Props {
  act: Activity;
  onDel: () => void;
  onUpd: (u: Partial<Activity>) => void;
  onPin: () => void;
}

export default function ActivityCard({ act, onDel, onUpd, onPin }: Props) {
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
    <div className="group card-surface flex items-start gap-2 rounded-card p-3" data-testid="activity-card">
      <GripVertical size={14} className="mt-1 text-ink-muted cursor-grab shrink-0" aria-label="Drag handle" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-ink-muted font-mono">{act.time}</span>
              <span className="text-sm font-medium text-ink-primary truncate">{act.name}</span>
              {act.budgetWarning && <AlertTriangle size={12} className="text-status-warning" aria-label="Budget warning" />}
            </div>
            <div className="text-xs text-ink-muted mt-0.5">{act.locationName}</div>
            {act.notes && <div className="text-xs text-ink-secondary mt-1 line-clamp-2">{act.notes}</div>}
          </div>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onPin} className={`p-1 rounded-lg ${act.pinnedToTodo ? 'text-accent' : 'text-ink-muted hover:text-ink-primary'}`} aria-label={act.pinnedToTodo ? 'Unpin' : 'Pin to to-do'}>
              <Pin size={14} />
            </button>
            <button onClick={() => setEd(true)} className="p-1 rounded-lg text-ink-muted hover:text-ink-primary" aria-label="Edit activity">
              <Pencil size={14} />
            </button>
            <button onClick={onDel} className="p-1 rounded-lg text-ink-muted hover:text-status-danger" aria-label="Delete activity">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
