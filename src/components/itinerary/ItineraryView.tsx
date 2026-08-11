import { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, PlusCircle, Sparkles, CalendarCheck } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { type Plan, type Activity, type ClipboardItem, db } from '../../db';
import { getDayColor } from '../../constants/colors';
import Toast from '../ui/Toast';
import GenerateItinerary from './GenerateItinerary';
import ActivityCard, { SlotPicker } from './ActivityCard';
import LinkedClipboardCard from './LinkedClipboardCard';
import { scrollBehavior } from '../../utils/motion';
import { useIsMobile } from '../../hooks/useIsMobile';
import { sortByTime, sortBySlot, moveActivity, findTimeClashes, nextFreeTime, formatTime, slotForTime, slotIndex, exactTime, TIME_SLOTS, type TimeSlotId } from '../../utils/activityTime';
import { findActivityBookings, bookingWarning } from '../../utils/activityBookings';
import { tripTiming, relativeDayLabel } from '../../utils/tripDay';
import { useConfirm } from '../ui/ConfirmDialog';

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
  onAdd: (n: string, t: string, loc: string, notes: string) => Promise<void>;
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
  const [loc, setLoc] = useState('');
  const [notes, setNotes] = useState('');
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
    await onAdd(nm.trim(), tm, loc.trim(), notes.trim());
    setNm('');
    setLoc('');
    setNotes('');
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
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full border border-status-success/40 bg-surface-raised text-status-success hover:bg-status-success/10 hover:border-status-success transition-colors"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
      </div>
    );
  }

  if (!open) return (
    <button onClick={start} className="flex items-center gap-1 text-xs text-status-success hover:brightness-125 py-2">
      <PlusCircle size={12} /> Add activity
    </button>
  );

  const fields = (
    <>
      <input autoFocus value={nm} onChange={e => setNm(e.target.value)} placeholder="Activity name"
        className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none" />

      {/* Without this the activity can never reach the map: geocoding only
          ever looks at the location, so every hand-added card was invisible
          there with nothing to say why. */}
      <input value={loc} onChange={e => setLoc(e.target.value)} placeholder="Location (for the map)"
        aria-label="Location"
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

      {/* Was missing entirely, so anything worth noting meant saving the
          activity and reopening it in edit mode to write it down. */}
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        aria-label="Notes"
        placeholder="Notes — a booking reference, what to bring, who to ask for"
        className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none resize-none"
        data-testid="add-notes-input"
      />

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
   * Adding is a dialog at every width, and the same one the other tabs use.
   *
   * On desktop the fields used to unfold inline, which read as the card list
   * having sprouted unlabelled inputs — nothing said what had opened or how to
   * leave it.
   *
   * On a phone it is pinned to the top: an activity added at the bottom of a
   * long day sits exactly where the on-screen keyboard appears, so the fields
   * have to be somewhere the keyboard cannot reach.
   */
  return (
    <Modal
      title={`Add to ${dayLabel}`}
      onClose={() => setOpen(false)}
      anchor={isMobile ? 'top' : 'center'}
    >
      <form onSubmit={submit} className="space-y-2">
        {fields}
        <div className="flex gap-2 pt-1">
          <Button type="submit" data-testid="add-save-btn">Save</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Modal>
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
  const confirm = useConfirm();
  const navigate = useNavigate();

  /*
   * Clipboard items linked to a day belong on that day. Linking a hotel
   * confirmation to day three used to record the link and show it nowhere,
   * so the itinerary said nothing about a check-in and the only way to find
   * it was to remember it existed.
   */
  const linked = useLiveQuery(
    () => db.clipboard.where('planId').equals(plan.id).toArray(),
    [plan.id],
  );
  const linkedByDay = new Map<number, ClipboardItem[]>();
  // Undefined while the query is in flight, and the itinerary is worth
  // rendering before the clipboard has loaded.
  for (const c of Array.isArray(linked) ? linked : []) {
    if (c.linkedDayIndex === undefined) continue;
    const list = linkedByDay.get(c.linkedDayIndex) ?? [];
    list.push(c);
    linkedByDay.set(c.linkedDayIndex, list);
  }
  const timing = tripTiming(plan);
  const todayIndex = timing.todayIndex;
  // Once per plan: scrolling back to today every render would fight the user
  // the moment they looked at any other day.
  const scrolledFor = useRef<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [showGen, setShowGen] = useState(false);

  /*
   * A trip in progress opens on today rather than day one.
   *
   * Someone standing in Percé on day four had to scroll past three days that
   * had already happened — the app knew the date and the dates of the trip,
   * and used neither.
   */
  useEffect(() => {
    if (todayIndex === null || scrolledFor.current === plan.id) return;
    const el = document.getElementById(`day-${todayIndex}`);
    if (!el) return;
    scrolledFor.current = plan.id;
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, [plan.id, todayIndex, plan.itinerary]);

  const goToToday = () => {
    if (todayIndex === null) return;
    setCollapsed((prev) => ({ ...prev, [todayIndex]: false }));
    document.getElementById(`day-${todayIndex}`)?.scrollIntoView({ behavior: scrollBehavior() });
  };

  const persist = (it: typeof plan.itinerary) =>
    db.plans.update(plan.id, { itinerary: it, updatedAt: new Date().toISOString() });

  const addAct = async (di: number, name: string, time: string, locationName: string, notes: string, afterId?: string) => {
    const newAct: Activity = { id: uuidv4(), name, time, locationName, notes, pinnedToTodo: false };
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
      if (items.length) {
        const ok = await confirm({
          title: `Remove "${act.name}" from your to-do list?`,
          body: items.length === 1
            ? 'The task it created will be deleted.'
            : `The ${items.length} tasks it created will be deleted.`,
          confirmLabel: 'Remove',
          tone: 'danger',
        });
        if (!ok) return;
      }
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
    return confirm({
      title: 'You have a booking for this',
      body: bookingWarning(bookings),
      confirmLabel: 'Change it anyway',
    });
  };

  // onCancel only when there is an itinerary to return to. A plan with no
  // days has nothing behind this screen, so a Back button would go nowhere.
  if (showGen || !plan.itinerary?.length)
    return (
      <GenerateItinerary
        plan={plan}
        onGenerated={() => setShowGen(false)}
        onCancel={showGen && plan.itinerary?.length ? () => setShowGen(false) : undefined}
      />
    );

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
        {todayIndex !== null && (
          <button
            onClick={goToToday}
            className="shrink-0 flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-accent text-ink-inverse font-semibold"
            data-testid="jump-to-today"
          >
            <CalendarCheck size={12} aria-hidden="true" /> Today
          </button>
        )}
        <button onClick={() => setShowGen(true)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-white/10 text-accent hover:bg-accent/10 ml-auto">
          <Sparkles size={12} /> Regenerate
        </button>
      </div>

      {/* The one line a traveller wants on opening: is this trip happening,
          and how much of it is left. */}
      {timing.status !== 'unknown' && (
        <p className="px-4 pt-2 text-xs text-ink-muted shrink-0" data-testid="trip-timing">
          {timing.status === 'upcoming' && (
            timing.daysUntil === 0 ? 'Starts today' :
            timing.daysUntil === 1 ? 'Starts tomorrow' :
            `Starts in ${timing.daysUntil} days`
          )}
          {timing.status === 'active' && (
            `Day ${(todayIndex ?? 0) + 1} of your trip` +
            (timing.daysRemaining ? ` · ${timing.daysRemaining} day${timing.daysRemaining === 1 ? '' : 's'} to go` : '')
          )}
          {timing.status === 'past' && 'This trip has ended'}
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4" data-testid="itinerary-days">
        {plan.itinerary.map(day => {
          const isCol = collapsed[day.dayIndex];
          const bb = budgetLabel(day.estimatedDailySpend, plan.intake?.budgetRange);
          const isToday = day.dayIndex === todayIndex;
          const dayClips = sortBySlot(linkedByDay.get(day.dayIndex) ?? [], c => c.time);
          const near = relativeDayLabel(plan.startDate, day.dayIndex);

          return (
            <section
              key={day.dayIndex}
              id={`day-${day.dayIndex}`}
              aria-label={isToday ? `${day.label} (today)` : day.label}
              data-testid={isToday ? 'today-section' : undefined}
              // A rail rather than a filled background: the day has to stand
              // out among the others without the cards inside it changing.
              className={isToday ? 'border-l-2 border-accent -ml-3 pl-3 rounded-l' : undefined}
            >
              <button
                className="w-full flex items-center gap-2 py-2 text-left"
                onClick={() => setCollapsed(p => ({ ...p, [day.dayIndex]: !p[day.dayIndex] }))}
                aria-expanded={!isCol}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getDayColor(day.dayIndex) }} aria-hidden="true" />
                <span className="text-base font-semibold text-ink-primary flex-1">{day.label}</span>
                {near && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      near === 'Today' ? 'bg-accent text-ink-inverse' : 'bg-white/5 text-ink-secondary'
                    }`}
                    data-testid={`day-relative-${day.dayIndex}`}
                  >
                    {near}
                  </span>
                )}
                {bb && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bb.warn ? 'text-status-warning bg-status-warning/10' : 'text-accent bg-accent/10'}`}>{bb.text}</span>}
                {isCol ? <ChevronRight size={16} className="text-ink-muted" /> : <ChevronDown size={16} className="text-ink-muted" />}
              </button>

              {!isCol && (
                <div className={`space-y-2 ml-4 border-l-2 pl-3 pb-2 border-white/5`}>
                  {day.activities.length === 0 && dayClips.length === 0 && (
                    <p className="text-xs text-ink-muted py-2">No activities yet.</p>
                  )}

                  {/* Items with no time of their own sit at the head of the
                      day rather than being interleaved by a slot they never
                      claimed. */}
                  {dayClips.filter(c => !c.time).map(c => (
                    <LinkedClipboardCard
                      key={c.id}
                      item={c}
                      onOpen={() => navigate(`/plan/${plan.id}/clipboard/${c.id}?from=itinerary`)}
                    />
                  ))}

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
                      {/* Anything booked for this part of the day, shown
                          where it happens rather than in a list apart. */}
                      {dayClips
                        .filter(c => c.time && slotIndex(c.time) === slotIndex(act.time)
                          && (ai === sorted.length - 1 || slotIndex(c.time) !== slotIndex(sorted[ai + 1].time)))
                        .map(c => (
                          <LinkedClipboardCard
                            key={c.id}
                            item={c}
                            onOpen={() => navigate(`/plan/${plan.id}/clipboard/${c.id}?from=itinerary`)}
                          />
                        ))}

                      {ai < sorted.length - 1 && (
                        <AddInline
                          siblings={day.activities}
                          dayLabel={day.label}
                          variant="gap"
                          label={`Add activity between ${act.name} and ${sorted[ai + 1].name}`}
                          seedSlot={seedSlotFor(act, sorted[ai + 1])}
                          onAdd={(name, time, loc, notes) => addAct(day.dayIndex, name, time, loc, notes, act.id)}
                        />
                      )}
                    </div>
                  ))}
                  {dayClips
                    .filter(c => c.time && !day.activities.some(a => slotIndex(a.time) === slotIndex(c.time)))
                    .map(c => (
                      <LinkedClipboardCard
                        key={c.id}
                        item={c}
                        onOpen={() => navigate(`/plan/${plan.id}/clipboard/${c.id}?from=itinerary`)}
                      />
                    ))}

                  <AddInline siblings={day.activities} dayLabel={day.label}
                    seedSlot={seedSlotFor(sortByTime(day.activities).slice(-1)[0])}
                    onAdd={(name, time, loc, notes) => addAct(day.dayIndex, name, time, loc, notes)} />
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
