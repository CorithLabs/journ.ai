import { useState } from 'react';
import { Sparkles, CheckCircle2, XCircle, AlertTriangle, GripVertical } from 'lucide-react';
import { type Day, type Activity, db } from '../../db';
import { getApiKey } from '../../services/aiKey';
import { totalRouteDistanceKm } from '../../services/mapbox';
import Toast from '../ui/Toast';

interface Props { planId: string; day: Day; planStartDate: string; isOffline: boolean; }
interface OptimisedActivity { activity: Activity; originalIndex: number; }
type Status = 'idle' | 'loading' | 'optimal' | 'suggestion' | 'error';

function buildPrompt(day: Day): string {
  const list = day.activities.filter(a => a.coordinates)
    .map((a, i) => `${i + 1}. ${a.name} at ${a.locationName} [${a.coordinates![1].toFixed(4)}, ${a.coordinates![0].toFixed(4)}]`)
    .join('\n');
  return `Optimise the visit order for "${day.label}" to minimise travel distance.\nActivities:\n${list}\n\nReturn ONLY a JSON array of activity names in optimised order. No other text.`;
}

async function callAI(day: Day): Promise<string[] | null> {
  const key = await getApiKey();
  if (!key) return null;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a travel route optimiser. Return only a JSON array of activity names. No other text.' }, { role: 'user', content: buildPrompt(day) }], temperature: 0.2, max_tokens: 500 }),
    });
    if (!r.ok) return null;
    const d = await r.json() as { choices?: { message?: { content?: string } }[] };
    const c = d.choices?.[0]?.message?.content?.trim();
    if (!c) return null;
    const m = c.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const p = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(p)) return null;
    return p.filter(n => typeof n === 'string') as string[];
  } catch { return null; }
}

function reorder(acts: Activity[], names: string[]): Activity[] {
  const res: Activity[] = [];
  const rem = [...acts];
  for (const n of names) {
    const i = rem.findIndex(a => a.name.toLowerCase() === n.toLowerCase() || a.name.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(a.name.toLowerCase()));
    if (i !== -1) res.push(rem.splice(i, 1)[0]);
  }
  res.push(...rem);
  return res;
}

function coords(acts: Activity[]): [number, number][] {
  return acts.filter(a => a.coordinates).map(a => a.coordinates as [number, number]);
}

export default function RouteOptimisation({ planId, day, isOffline }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [order, setOrder] = useState<OptimisedActivity[]>([]);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [origDist, setOrigDist] = useState(0);
  const [newDist, setNewDist] = useState(0);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const withCoords = day.activities.filter(a => a.coordinates);
  const canOpt = withCoords.length >= 3;

  const optimise = async () => {
    if (!canOpt || isOffline) return;
    setStatus('loading'); setErr(null);
    try {
      const names = await callAI(day);
      if (!names?.length) { setStatus('error'); setErr('Could not get suggestions. Check your API key in Settings.'); return; }
      const reordered = reorder(withCoords, names);
      if (reordered.every((a, i) => a.id === withCoords[i]?.id)) { setStatus('optimal'); return; }
      setOrigDist(totalRouteDistanceKm(coords(withCoords)));
      setNewDist(totalRouteDistanceKm(coords(reordered)));
      setOrder(reordered.map(a => ({ activity: a, originalIndex: withCoords.findIndex(o => o.id === a.id) })));
      setRejected(new Set());
      setStatus('suggestion');
    } catch { setStatus('error'); setErr('Optimisation failed.'); }
  };

  const accept = async () => {
    const plan = await db.plans.get(planId);
    if (!plan) return;
    const orig = plan.itinerary;
    const accepted = order.filter(x => !rejected.has(x.activity.id)).map(x => x.activity);
    const noGeo = day.activities.filter(a => !a.coordinates);
    const rejects = order.filter(x => rejected.has(x.activity.id)).sort((a, b) => a.originalIndex - b.originalIndex);
    const final = [...accepted];
    for (const r of rejects) final.splice(Math.min(r.originalIndex, final.length), 0, r.activity);
    await db.plans.update(planId, { itinerary: orig.map(d => d.dayIndex === day.dayIndex ? { ...d, activities: [...final, ...noGeo] } : d), updatedAt: new Date().toISOString() });
    const undo = async () => { await db.plans.update(planId, { itinerary: orig, updatedAt: new Date().toISOString() }); setToast(null); };
    setToast({ msg: 'Route optimised!', undo });
    setStatus('idle');
  };

  return (
    <div className="shrink-0" data-testid="route-optimisation-panel">
      {(status === 'idle' || status === 'error') && (
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3">
          <button onClick={optimise} disabled={!canOpt || isOffline}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors ${canOpt && !isOffline ? 'bg-accent hover:bg-accent-light text-ink-inverse' : 'bg-surface-overlay text-ink-muted border border-white/10 cursor-not-allowed'}`}
            title={isOffline ? 'AI unavailable offline' : !canOpt ? 'Need at least 3 stops to optimise' : undefined}
            aria-disabled={!canOpt || isOffline} data-testid="optimise-route-btn">
            <Sparkles size={12} aria-hidden="true" /> Optimise Route
          </button>
          {!canOpt && withCoords.length > 0 && withCoords.length < 3 && <span className="text-xs text-ink-muted">Need at least 3 geocoded stops to optimise</span>}
          {err && <div className="flex items-center gap-1 text-xs text-status-danger"><AlertTriangle size={12} aria-hidden="true" />{err}</div>}
        </div>
      )}

      {status === 'loading' && (
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2 text-xs text-ink-secondary">
          <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-label="Optimising route" />
          Analysing route…
        </div>
      )}

      {status === 'optimal' && (
        <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs"><CheckCircle2 size={14} className="text-status-success" /><span className="text-ink-secondary">Your route is already optimal!</span></div>
          <button onClick={() => setStatus('idle')} className="text-ink-muted hover:text-ink-primary" aria-label="Dismiss"><XCircle size={14} /></button>
        </div>
      )}

      {status === 'suggestion' && order.length > 0 && (
        <div className="border-t border-white/5 bg-surface-overlay" data-testid="optimisation-overlay">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Sparkles size={14} className="text-accent" /><span className="text-sm font-medium text-ink-primary">Optimised Route</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="text-ink-muted line-through">{origDist.toFixed(1)} km</span><span className="text-status-success font-semibold">→ {newDist.toFixed(1)} km</span></div>
          </div>
          <div className="px-4 pb-2 space-y-1.5 max-h-44 overflow-y-auto">
            {order.map((item, i) => {
              const rej = rejected.has(item.activity.id);
              return (
                <div key={item.activity.id} className={`flex items-center gap-2 p-2 rounded-xl text-xs bg-surface-raised border border-white/5 ${rej ? 'opacity-40' : ''}`} data-testid="optimised-activity-item">
                  <GripVertical size={12} className="text-ink-muted shrink-0" aria-hidden="true" />
                  <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className={`flex-1 min-w-0 ${rej ? 'line-through' : ''}`}><span className="text-ink-primary font-medium">{item.activity.name}</span><span className="text-ink-muted ml-1">· {item.activity.time}</span></div>
                  {item.originalIndex !== i && !rej && <span className="text-xs text-accent shrink-0">was #{item.originalIndex + 1}</span>}
                  <button onClick={() => setRejected(s => { const n = new Set(s); n.has(item.activity.id) ? n.delete(item.activity.id) : n.add(item.activity.id); return n; })}
                    className="p-0.5 rounded shrink-0 text-ink-muted hover:text-status-danger"
                    aria-label={rej ? `Restore ${item.activity.name}` : `Reject ${item.activity.name}`}
                    data-testid="reject-stop-btn"><XCircle size={12} /></button>
                </div>
              );
            })}
          </div>
          <div className="px-4 pb-3 flex gap-2">
            <button onClick={accept} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-status-success/10 text-status-success border border-status-success/20 hover:bg-status-success/20 transition-colors font-semibold" data-testid="accept-optimisation-btn">
              <CheckCircle2 size={12} aria-hidden="true" /> Accept Route
            </button>
            <button onClick={() => { setStatus('idle'); setOrder([]); }} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-surface-raised text-ink-muted border border-white/10 hover:text-status-danger transition-colors" data-testid="reject-optimisation-btn">
              <XCircle size={12} aria-hidden="true" /> Reject All
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} onDismiss={() => setToast(null)} action={toast.undo ? { label: 'Undo', onClick: toast.undo } : undefined} />}
    </div>
  );
}
