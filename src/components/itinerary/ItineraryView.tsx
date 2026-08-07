import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, PlusCircle, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { type Plan, type Activity, db } from '../../db';
import { getDayColor } from '../../constants/colors';
import Toast from '../ui/Toast';
import GenerateItinerary from './GenerateItinerary';
import ActivityCard, { SlotPicker } from './ActivityCard';
import { scrollBehavior } from '../../utils/motion';
import { useIsMobile } from '../../hooks/useIsMobile';
import { sortByTime, moveActivity, findTimeClashes, nextFreeTime, formatTime, slotForTime, exactTime, TIME_SLOTS, type TimeSlotId } from '../../utils/activityTime';
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
  onAdd, siblings, dayLabel, seedSlot = 'morning', variant = 'link', label = 'Add activity',
}: {
  onAdd: (n: string, t: string) => Promise<void>;
  siblings: Activity[];
  dayLabel: string;
  /** Which part of the day this button sits in. */
  seedSlot?: TimeSlotId;
  variant?: 'link' | 'gap';
  label?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [nm, setNm] = useState('');
  const [tm, setTm] = useState<string>(seedSlot);
  const [showExact, setShowExact] = useState(false);

  const clashes = findTimeClashes(siblings, tm);
  const free = clashes.length ? nextFreeTime(siblings, tm) : null;

  const start = () => {
    // The seed is only right at the moment of opening: a card either side may
    // have moved since this button rendered.
    setTm(seedSlot);
    setShowExact(false);
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
     * one tap where it belongs rather than "add at the bottom, then move it
     * up". The part of the day is taken from the gap itself.
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
      <input autoFocus value={nm} onChange={e => setNm(e.target.value)} placeholder="Activity name"
        className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none" />

      {/* Part of the day first — that is what a plan is built in. The clock is
          for the few things that come with one. */}
      <SlotPicker value={tm} onPick={setTm} />

      {showExact ? (
        <input type="time" value={exactTime(tm) ?? ''} onChange={e => setTm(e.target.value)}
          className="bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-xs text-ink-primary w-28 focus:outline-none" aria-label="Exact time" />
      ) : (
        <button type="button" onClick={() => setShowExact(true)}
          className="text-xs text-ink-muted hover:text-accent" data-testid="add-exact-time">
          + Exact time
        </button>
      )}

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
    <form onSubmit={submit} className="space-y-2">
      {fields}
      <div className="flex gap-2">
        <button type="submit" className="text-xs text-accent hover:underline">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-muted hover:underline">Cancel</button>
      </div>
    </form>
  );
}

/**
 * Which part of the day a `+` between two cards should offer.
 *
 * The card above it, since that is what the user just pointed past — a gap
 * inside the evening adds to the evening. At the very top of a day there is
 * no card above, so the one below decides.
 */
function seedSlotFor(before?: Activity, after?: Activity): TimeSlotId {
  return slotForTime(before?.time) ?? slotForTime(after?.time) ?? TIME_SLOTS[0].id;
}

export default function ItineraryView({ plan }: Props) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [showGen, setShowGen] = useState(false);

  const persist = (it: typeof plan.itinerary) =>
    db.plans.update(plan.id, { itinerary: it, updatedAt: new Date().toISOString() });

  const addAct = async (di: number, name: string, time: string, afterId?: string) => {
    const newAct: Activity = { id: uuidv4(), name, time, locationName: '', notes: '', pinnedToTodo: false };
    const acts = plan.itinerary[di].activities;
    // Order within a part of the day is the array's, so an activity added from
    // a gap has to land in that gap rather than at the end of the day.
    const at = afterId ? acts.findIndex(a => a.id === afterId) + 1 : acts.length;
    const next = [...acts.slice(0, at), newAct, ...acts.slice(at)];
    await persist(plan.itinerary.map((d, i) => i === di ? { ...d, activities: next } : d));
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
   * Move up / down one place through the day.
   *
   * Crossing into the next part of the day is what changes the time — the card
   * takes that slot. Within a slot the cards simply trade places, because
   * order inside a slot is the order the user arranged, not a clock.
   */
  const moveAct = async (di: number, id: string, dir: 'up' | 'down') => {
    const acts = plan.itinerary[di].activities;
    const next = moveActivity(acts, id, dir);
    if (next === acts) return;

    const before = acts.find(a => a.id === id);
    const after = next.find(a => a.id === id);
    // Only a slot change is a time change, and only that needs confirming.
    if (before && after && before.time !== after.time && !(await confirmTimeChange(before))) return;

    await persist(plan.itinerary.map((d, i) => (i === di ? { ...d, activities: next } : d)));
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
                        <button disabled={ai === 0} onClick={() => moveAct(day.dayIndex, act.id, 'up')} className="text-xs text-ink-muted hover:text-ink-primary disabled:opacity-30 px-2 py-2 md:py-0.5 rounded-lg" aria-label={`Move ${act.name} up`}>&#8593; Move up</button>
                        <button disabled={ai === sorted.length - 1} onClick={() => moveAct(day.dayIndex, act.id, 'down')} className="text-xs text-ink-muted hover:text-ink-primary disabled:opacity-30 px-2 py-2 md:py-0.5 rounded-lg" aria-label={`Move ${act.name} down`}>&#8595; Move down</button>
                      </div>
                      {ai < sorted.length - 1 && (
                        <AddInline
                          siblings={day.activities}
                          dayLabel={day.label}
                          variant="gap"
                          label={`Add activity between ${act.name} and ${sorted[ai + 1].name}`}
                          seedSlot={seedSlotFor(act, sorted[ai + 1])}
                          onAdd={(name, time) => addAct(day.dayIndex, name, time, act.id)}
                        />
                      )}
                    </div>
                  ))}
                  <AddInline siblings={day.activities} dayLabel={day.label}
                    seedSlot={seedSlotFor(sortByTime(day.activities).slice(-1)[0])}
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
