import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, PlusCircle, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { type Plan, type Activity, db } from '../../db';
import { getDayColor } from '../../constants/colors';
import Toast from '../ui/Toast';
import GenerateItinerary from './GenerateItinerary';
import ActivityCard from './ActivityCard';
import { scrollBehavior } from '../../utils/motion';
import { useIsMobile } from '../../hooks/useIsMobile';
import { sortByTime, swapTimes, findTimeClashes, nextFreeTime, formatTime, timeBetween } from '../../utils/activityTime';
import { findActivityBookings, bookingWarning } from '../../utils/activityBookings';

interface Props { plan: Plan; }

function budgetLabel(
  spend?: { min: number; max: number },
  range?: string | null,
): { text: string; warn: boolean } | null {
  if (!spend) return null;
  const lo = Math.min(spend.min, spend.max);
  const hi = Math.max(spend.min, spend.max);
  const caps: Record<string, number> = { budget: 100, mid: 300, premium: 600 };
  return { text: `Est. $${lo}\u2013${hi}/day`, warn: lo > (caps[range ?? ''] ?? Infinity) };
}

function AddInline({
  onAdd, siblings, dayLabel, seedTime = '09:00', variant = 'link', label = 'Add activity',
}: {
  onAdd: (n: string, t: string) => Promise<void>;
  siblings: Activity[];
  dayLabel: string;
  /** Where in the day this button sits, as a time. */
  seedTime?: string;
  variant?: 'link' | 'gap';
  label?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [nm, setNm] = useState('');
  const [tm, setTm] = useState(seedTime);

  const clashes = findTimeClashes(siblings, tm);
  const free = clashes.length ? nextFreeTime(siblings, tm) : null;

  const start = () => {
    // The seed is only right at the moment of opening: a card either side may
    // have moved since this button rendered.
    setTm(seedTime);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nm.trim()) return;
    await onAdd(nm.trim(), tm);
    setNm('');
    setOpen(false);
  };

  if (!open && variant === 'gap') {
    /*
     * A + in the space between two cards, so adding something mid-afternoon is
     * one tap where it belongs rather than "add at the bottom, then set the
     * time, then move it up". The time is pre-filled from the gap itself.
     */
    return (
      <div className="flex items-center gap-2 py-1 opacity-60 hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
        <button
          type="button"
          onClick={start}
          aria-label={label}
          data-testid="add-activity-gap"
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full border border-white/10 bg-surface-raised text-ink-muted hover:text-accent hover:border-accent/40 transition-colors"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
      </div>
    );
  }

  if (!open) return (
    <button onClick={start} className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent py-2">
      <PlusCircle size={12} /> Add activity
    </button>
  );

  const fields = (
    <>
      <div className="flex gap-2 items-center">
        <input type="time" value={tm} onChange={e => setTm(e.target.value)} className="bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-xs text-ink-primary w-24 focus:outline-none" aria-label="Time" />
        <input autoFocus value={nm} onChange={e => setNm(e.target.value)} placeholder="Activity name"
          className="flex-1 min-w-0 bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none" />
      </div>
      {/* Caught before the activity exists, rather than after — cheaper to
          correct now than to notice a double-booked hour later. */}
      {clashes.length > 0 && (
        <p className="text-xs text-status-warning" role="alert" data-testid="add-time-clash">
          {`"${clashes[0].name}" is already at ${formatTime(tm)}.`}
          {free && (
            <>
              {' '}
              <button type="button" className="underline text-accent" onClick={() => setTm(free)}>
                Use {formatTime(free)}
              </button>
            </>
          )}
        </p>
      )}
    </>
  );

  /*
   * On a phone the form opens as a dialog pinned to the TOP of the screen.
   *
   * Inline, an activity added at the bottom of a long day sits directly above
   * the on-screen keyboard — which covers it the moment the field is focused,
   * so the user cannot see what they are typing. Anchoring high keeps the
   * fields in the visible half whatever the keyboard does.
   */
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 bg-black/50 z-50"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Add activity to ${dayLabel}`}
          className="fixed top-4 left-3 right-3 z-50 bg-surface-overlay border border-white/10 rounded-modal shadow-glass p-4 space-y-3"
          data-testid="add-activity-dialog"
        >
          <p className="text-sm font-semibold text-ink-primary">Add to {dayLabel}</p>
          <form onSubmit={submit} className="space-y-2">
            {fields}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 bg-accent text-ink-inverse font-semibold py-2 rounded-xl text-sm">Add</button>
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm text-ink-secondary border border-white/10">Cancel</button>
            </div>
          </form>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      {fields}
      <div className="flex gap-2">
        <button type="submit" className="text-xs text-accent hover:underline">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-muted hover:underline">Cancel</button>
      </div>
    </form>
  );
}

/**
 * The time to offer for an activity inserted at a given point in the day.
 *
 * Between the neighbours, then nudged past anything already sitting on that
 * minute — a pre-filled clash would just be a warning the user has to clear
 * before they can type a name.
 */
function insertTime(day: Activity[], before?: string | null, after?: string | null): string {
  const guess = timeBetween(before, after);
  return findTimeClashes(day, guess).length ? nextFreeTime(day, guess) ?? guess : guess;
}

export default function ItineraryView({ plan }: Props) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [showGen, setShowGen] = useState(false);

  const persist = (it: typeof plan.itinerary) =>
    db.plans.update(plan.id, { itinerary: it, updatedAt: new Date().toISOString() });

  const addAct = async (di: number, name: string, time: string) => {
    const newAct: Activity = { id: uuidv4(), name, time, locationName: '', notes: '', pinnedToTodo: false };
    // Appended, not spliced: the day is sorted by time on render, so where it
    // lands is decided by the time, not by its position in the array.
    await persist(plan.itinerary.map((d, i) => i === di ? { ...d, activities: [...d.activities, newAct] } : d));
  };

  const delAct = async (di: number, id: string) => {
    const saved = plan.itinerary[di].activities.find(a => a.id === id);
    await persist(plan.itinerary.map((d, i) => i === di ? { ...d, activities: d.activities.filter(a => a.id !== id) } : d));
    setToast({ msg: 'Activity deleted', undo: async () => {
      if (!saved) return;
      await persist(plan.itinerary.map((d, i) => i === di ? { ...d, activities: [...d.activities, saved] } : d));
      setToast(null);
    }});
  };

  const updAct = async (di: number, id: string, u: Partial<Activity>) => {
    // Editing is the other route to a time change, so it needs the same guard
    // as move up/down — otherwise the warning is trivially bypassed.
    const current = plan.itinerary[di]?.activities.find(a => a.id === id);
    if (current && u.time !== undefined && u.time !== current.time) {
      if (!(await confirmTimeChange(current))) return;
    }
    return persist(plan.itinerary.map((d, i) => i === di ? { ...d, activities: d.activities.map(a => a.id === id ? { ...a, ...u } : a) } : d));
  };

  const pinAct = async (di: number, act: Activity) => {
    if (act.pinnedToTodo) {
      const items = await db.todos.where('sourceActivityId').equals(act.id).toArray();
      if (items.length && !window.confirm('Remove from To-Do?')) return;
      await db.todos.bulkDelete(items.map(t => t.id));
      await updAct(di, act.id, { pinnedToTodo: false });
    } else {
      await db.todos.add({ id: uuidv4(), planId: plan.id, title: act.name, category: 'Other', status: 'todo', autoGenerated: false, sourceActivityId: act.id, sourceDayIndex: di, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await updAct(di, act.id, { pinnedToTodo: true });
      setToast({ msg: `"${act.name}" pinned to To-Do` });
    }
  };

  /**
   * Move up / down trades times with the neighbour.
   *
   * Splicing the array would achieve nothing: the day is sorted by time on
   * render, so the sort would immediately put the card back. Swapping keeps
   * the exact times the user typed rather than inventing one between two
   * neighbours, which is what dropping a dragged card into a gap would need.
   */
  const moveAct = async (di: number, idx: number, dir: 'up' | 'down') => {
    const acts = sortByTime(plan.itinerary[di].activities);
    const ni = dir === 'up' ? idx - 1 : idx + 1;
    if (ni < 0 || ni >= acts.length) return;

    const moving = acts[idx];
    const other = acts[ni];
    if (!(await confirmTimeChange(moving))) return;

    const swapped = swapTimes(plan.itinerary[di].activities, moving.id, other.id);
    await persist(plan.itinerary.map((d, i) => (i === di ? { ...d, activities: swapped } : d)));
  };

  /**
   * A booked activity is one the user has already committed to — a linked
   * clipboard confirmation, or a to-do they ticked off. Changing its time may
   * not match what was booked, so name what is at stake and let them decide.
   */
  const confirmTimeChange = async (act: Activity): Promise<boolean> => {
    const bookings = await findActivityBookings(plan.id, act.id);
    if (!bookings.length) return true;
    return window.confirm(`${bookingWarning(bookings)}

Change it anyway?`);
  };

  if (showGen || !plan.itinerary?.length)
    return <GenerateItinerary plan={plan} onGenerated={() => setShowGen(false)} />;

  return (
    <div className="flex flex-col h-full" data-testid="itinerary-view">
      <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 overflow-x-auto shrink-0">
        {plan.itinerary.map(d => (
          <button key={d.dayIndex}
            onClick={() => document.getElementById(`day-${d.dayIndex}`)?.scrollIntoView({ behavior: scrollBehavior() })}
            className="shrink-0 text-xs px-3 py-1 rounded-full border border-white/10 text-ink-secondary hover:text-ink-primary transition-colors">
            {d.label.split(' \u2014 ')[0]}
          </button>
        ))}
        <button onClick={() => setShowGen(true)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-white/10 text-accent hover:bg-accent/10 ml-auto">
          <Sparkles size={12} /> Regenerate
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4" data-testid="itinerary-days">
        {plan.itinerary.map(day => {
          const isCol = collapsed[day.dayIndex];
          const bb = budgetLabel(day.estimatedDailySpend, plan.intake?.budgetRange);

          return (
            <section key={day.dayIndex} id={`day-${day.dayIndex}`}
              aria-label={day.label}>
              <button
                className="w-full flex items-center gap-2 py-2 text-left"
                onClick={() => setCollapsed(p => ({ ...p, [day.dayIndex]: !p[day.dayIndex] }))}
                aria-expanded={!isCol}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getDayColor(day.dayIndex) }} aria-hidden="true" />
                <span className="text-base font-semibold text-ink-primary flex-1">{day.label}</span>
                {bb && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bb.warn ? 'text-status-warning bg-status-warning/10' : 'text-accent bg-accent/10'}`}>{bb.text}</span>}
                {isCol ? <ChevronRight size={16} className="text-ink-muted" /> : <ChevronDown size={16} className="text-ink-muted" />}
              </button>

              {!isCol && (
                <div className={`space-y-2 ml-4 border-l-2 pl-3 pb-2 border-white/5`}>
                  {day.activities.length === 0 && <p className="text-xs text-ink-muted py-2">No activities yet.</p>}
                  {sortByTime(day.activities).map((act, ai, sorted) => (
                    <div key={act.id}>
                      <ActivityCard act={act} plan={plan} siblings={day.activities}
                        onDel={() => delAct(day.dayIndex, act.id)}
                        onUpd={u => updAct(day.dayIndex, act.id, u)}
                        onPin={() => pinAct(day.dayIndex, act)} />
                      {/* The only way to reorder on touch — HTML5 drag and drop
                          does not fire on mobile — so these get real tap
                          targets rather than the 16px-tall text links they
                          were, which were effectively unhittable on a phone. */}
                      <div className="flex gap-1 mt-0.5 pl-6">
                        <button disabled={ai === 0} onClick={() => moveAct(day.dayIndex, ai, 'up')} className="text-xs text-ink-muted hover:text-ink-primary disabled:opacity-30 px-2 py-2 md:py-0.5 rounded-lg" aria-label={`Move ${act.name} up`}>&#8593; Move up</button>
                        <button disabled={ai === day.activities.length - 1} onClick={() => moveAct(day.dayIndex, ai, 'down')} className="text-xs text-ink-muted hover:text-ink-primary disabled:opacity-30 px-2 py-2 md:py-0.5 rounded-lg" aria-label={`Move ${act.name} down`}>&#8595; Move down</button>
                      </div>
                      {ai < sorted.length - 1 && (
                        <AddInline
                          siblings={day.activities}
                          dayLabel={day.label}
                          variant="gap"
                          label={`Add activity between ${act.name} and ${sorted[ai + 1].name}`}
                          seedTime={insertTime(day.activities, act.time, sorted[ai + 1].time)}
                          onAdd={(name, time) => addAct(day.dayIndex, name, time)}
                        />
                      )}
                    </div>
                  ))}
                  <AddInline siblings={day.activities} dayLabel={day.label}
                    seedTime={insertTime(day.activities, sortByTime(day.activities).slice(-1)[0]?.time)}
                    onAdd={(name, time) => addAct(day.dayIndex, name, time)} />
                </div>
              )}
            </section>
          );
        })}
      </div>

      {toast && <Toast message={toast.msg} onDismiss={() => setToast(null)} action={toast.undo ? { label: 'Undo', onClick: toast.undo } : undefined} />}
    </div>
  );
}
