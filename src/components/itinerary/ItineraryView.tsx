import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { getTempUnit } from '../../services/units';
import { isBeyondForecast } from '../../services/weather';
import { streamCompletion } from '../../services/aiClient';
import { dateForDayIndex } from '../../utils/tripDay';
import { hasOutdoorPlans } from '../../utils/outdoor';
import WeatherStrip from './WeatherStrip';
import WeatherAlertBadge from './WeatherAlertBadge';
import WeatherSuggestionsPanel, { parseSuggestions, type Suggestion } from './WeatherSuggestionsPanel';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import LocationField, { type PickedLocation } from '../ui/LocationField';
import { nearbyAnchor, locationContext } from '../../utils/locationSearch';
import { fieldClass, fieldClassAuto, notesClass } from '../ui/formStyles';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, PlusCircle, Sparkles, CalendarCheck } from 'lucide-react';
import TripHero from './TripHero';
import TransportStrip from './TransportStrip';
import TripSidePanel from './TripSidePanel';
import DayPhoto from './DayPhoto';
import { HAZARD } from './weatherHazard';
import { hazardsFor } from '../../utils/weatherUtils';
import { isLikelyOutdoor } from '../../utils/outdoor';
import { dayPlace } from '../../utils/dayPlace';
import { sameCity } from '../../utils/travel';
import { shortDate, weekdayOf } from '../../utils/dateText';
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
import { findActivityBookings, bookingWarning, bookedDayIndexes } from '../../utils/activityBookings';
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
  onAdd, siblings, plan, dayLabel, seedSlot = 'morning', variant = 'link', label = 'Add activity',
}: {
  onAdd: (n: string, t: string, loc: PickedLocation, notes: string) => Promise<void>;
  siblings: Activity[];
  plan: Plan;
  dayLabel: string;
  /** Which part of the day this button sits in. */
  seedSlot?: TimeSlotId;
  variant?: 'link' | 'gap';
  label?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [nm, setNm] = useState('');
  const [loc, setLoc] = useState<PickedLocation>({ locationName: '' });
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
    await onAdd(nm.trim(), tm, { ...loc, locationName: loc.locationName.trim() }, notes.trim());
    setNm('');
    setLoc({ locationName: '' });
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
        aria-label="Activity name" className={fieldClass} />

      {/* Where it is, chosen rather than described where possible. Typing a
          venue name and leaving it to be resolved later accepts whichever
          place of that name ranks highest; picking one settles it here and
          carries its coordinates, so nothing is guessed at afterwards. */}
      <LocationField
        value={loc.locationName}
        address={loc.address}
        proximity={nearbyAnchor(siblings)}
        context={locationContext(plan)}
        onChange={setLoc}
        testId="add-location"
      />

      {/* Part of the day first — that is what a plan is built in. The clock is
          for the few things that come with one. */}
      <SlotPicker value={tm} onPick={setTm} />

      {showExact ? (
        <input type="time" value={exactTime(tm) ?? ''} onChange={e => setTm(e.target.value)}
          className={fieldClassAuto} aria-label="Exact time" />
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
        rows={6}
        aria-label="Notes"
        placeholder="Notes — a booking reference, what to bring, who to ask for"
        className={notesClass}
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
      width="xl"
    >
      <form onSubmit={submit} className="space-y-3">
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
   * The forecast was already being fetched on every plan open and thrown
   * away: useWeather wrote it to the store and nothing ever read it. Three
   * finished components sat unmounted while the API calls went out anyway.
   */
  const weatherByDate = useAppStore((st) => st.weatherByDate);
  const isOffline = useAppStore((st) => st.offlineBannerVisible);
  const useFahrenheit = getTempUnit() === 'F';
  const [suggesting, setSuggesting] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<{ dayIndex: number; items: Suggestion[] } | null>(null);
  const [suggestError, setSuggestError] = useState('');

  /**
   * Ask the AI to rearrange around the weather.
   *
   * The badge builds the prompt, because it is the thing that knows which
   * alerts fired and which days are clear enough to swap with.
   */
  const askForSuggestions = async (dayIndex: number, prompt: string) => {
    setSuggesting(dayIndex);
    setSuggestError('');
    try {
      const text = await streamCompletion([{ role: 'user', content: prompt }]);
      const parsed = parseSuggestions(text, plan, dayIndex);
      if (!parsed.length) {
        setSuggestError('The AI did not come back with anything usable. Try again?');
        return;
      }
      setSuggestions({ dayIndex, items: parsed });
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : 'Could not reach the AI.');
    } finally {
      setSuggesting(null);
    }
  };

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
  // Loaded once for the whole view: which days are already committed to, so a
  // swap is never offered for one of them.
  const todos = useLiveQuery(() => db.todos.where('planId').equals(plan.id).toArray(), [plan.id]);
  const bookedDays = bookedDayIndexes(
    plan,
    Array.isArray(linked) ? linked : [],
    Array.isArray(todos) ? todos : [],
  );

  /*
   * Attachments are found by activity, across the whole plan, rather than by
   * the day the item recorded when it was linked. Move the activity to another
   * day and its confirmation goes with it — which is what linking the two was
   * for. Keyed off linkedDayIndex it would have stayed behind on the old day.
   */
  const attachedByActivity = new Map<string, ClipboardItem[]>();
  const activityDay = new Map<string, number>();
  for (const d of plan.itinerary) {
    for (const a of d.activities) activityDay.set(a.id, d.dayIndex);
  }
  for (const c of Array.isArray(linked) ? linked : []) {
    if (c.linkedActivityId && activityDay.has(c.linkedActivityId)) {
      const list = attachedByActivity.get(c.linkedActivityId) ?? [];
      list.push(c);
      attachedByActivity.set(c.linkedActivityId, list);
    }
  }

  const linkedByDay = new Map<number, ClipboardItem[]>();
  // Undefined while the query is in flight, and the itinerary is worth
  // rendering before the clipboard has loaded.
  for (const c of Array.isArray(linked) ? linked : []) {
    if (c.linkedDayIndex === undefined) continue;
    // Anything attached to an activity is drawn with that activity instead.
    if (c.linkedActivityId && activityDay.has(c.linkedActivityId)) continue;
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

  const addAct = async (di: number, name: string, time: string, loc: PickedLocation, notes: string, afterId?: string) => {
    const newAct: Activity = {
      id: uuidv4(),
      name,
      time,
      locationName: loc.locationName,
      // Present only when a venue was picked from the list. Without them the
      // card is geocoded the usual way next time the map is opened.
      coordinates: loc.coordinates,
      address: loc.address,
      notes,
      pinnedToTodo: false,
    };
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

  /*
   * The day bar follows the reading. The bar is pinned, so it is the one
   * place that can say where in the trip you are; without this it only ever
   * highlighted the day it was opened on.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const dayCount = plan.itinerary?.length ?? 0;
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const seen = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (seen) setActiveDay(Number((seen.target as HTMLElement).dataset.dayIndex));
    }, { root, rootMargin: '-15% 0px -65% 0px', threshold: [0, 0.25, 0.5] });
    root.querySelectorAll('[data-day-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dayCount, showGen]);

  // Keep the highlighted day in view when the bar scrolls sideways on a phone,
  // without moving the page.
  useEffect(() => {
    const bar = barRef.current;
    const btn = bar?.querySelector<HTMLElement>(`[data-jump="${activeDay}"]`);
    if (bar && btn && typeof bar.scrollTo === 'function') bar.scrollTo({ left: btn.offsetLeft - 16 });
  }, [activeDay]);

  const jumpToDay = (dayIndex: number) => {
    setCollapsed((prev) => ({ ...prev, [dayIndex]: false }));
    document.getElementById(`day-${dayIndex}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
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

  /* Why there is no forecast, when it is because the trip is too far off.
     Shown on the trip photo, where the forecast would otherwise be. */
  const forecastNote = !weatherByDate && isBeyondForecast(plan.startDate) ? (
    <p className="text-xs text-ink-secondary" data-testid="weather-too-far">
      Too far ahead to forecast — the weather appears about two weeks before you go.
    </p>
  ) : null;

  const clipList = Array.isArray(linked) ? linked : [];
  const todoList = Array.isArray(todos) ? todos : [];
  const hasSide = todoList.length > 0
    || clipList.some((c) => c.linkedDayIndex !== undefined)
    || !!plan.intake?.likes?.length || !!plan.intake?.dislikes?.length;
  // Where each day is spent, so a day that arrives somewhere new gets its photo.
  const places = plan.itinerary.map((d) => dayPlace(plan, d));

  return (
    <div className="flex flex-col h-full" data-testid="itinerary-view">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" data-testid="itinerary-days">
        <div className="max-w-[1180px] mx-auto px-3 md:px-6 pt-4 pb-12 space-y-4">
          <TripHero
            plan={plan}
            timing={timing}
            todayIndex={todayIndex}
            weatherByDate={weatherByDate}
            useFahrenheit={useFahrenheit}
            forecastNote={forecastNote}
            onJumpToDay={jumpToDay}
          />
          <TransportStrip plan={plan} />

          {/* Pinned while the days scroll beneath it. */}
          <div className="sticky top-0 z-10 -mx-3 md:-mx-6 px-3 md:px-6 py-2.5 bg-surface-base/90 backdrop-blur-glass border-b border-white/5 flex items-center gap-2">
            <nav ref={barRef} aria-label="Jump to a day" className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {plan.itinerary.map(d => {
                const color = getDayColor(d.dayIndex);
                const date = dateForDayIndex(plan.startDate, d.dayIndex);
                const w = date ? weatherByDate?.[date] : undefined;
                const hz = w ? hazardsFor(w)[0] : undefined;
                const short = d.label.split(' — ')[0];
                const on = activeDay === d.dayIndex;
                const HzIcon = hz ? HAZARD[hz].Icon : null;
                return (
                  <button key={d.dayIndex}
                    data-jump={d.dayIndex}
                    onClick={() => jumpToDay(d.dayIndex)}
                    aria-current={on ? 'true' : undefined}
                    aria-label={hz ? `${short}, ${HAZARD[hz].title.toLowerCase()}` : undefined}
                    className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      on ? 'text-ink-inverse' : 'border-white/10 bg-surface-raised text-ink-secondary hover:text-ink-primary'
                    }`}
                    style={on ? { backgroundColor: color, borderColor: color } : undefined}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: on ? 'var(--color-ink-inverse)' : color }} aria-hidden="true" />
                    {short}
                    {HzIcon && hz && <HzIcon size={13} className={on ? undefined : HAZARD[hz].text} aria-hidden="true" />}
                  </button>
                );
              })}
            </nav>
            {todayIndex !== null && (
              <button
                onClick={goToToday}
                className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-accent text-ink-inverse font-semibold"
                data-testid="jump-to-today"
              >
                <CalendarCheck size={12} aria-hidden="true" /> Today
              </button>
            )}
            <button
              onClick={() => setShowGen(true)}
              aria-label="Regenerate"
              className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl border border-white/10 text-accent hover:bg-accent/10"
            >
              <Sparkles size={12} aria-hidden="true" /> <span className="hidden sm:inline">Regenerate</span>
            </button>
          </div>

          <div className={hasSide ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-8 xl:items-start' : undefined}>
            <div className="relative space-y-5 md:space-y-7">
              {/* The line the day markers hang from. */}
              <span className="absolute left-[17px] md:left-[23px] top-6 bottom-6 w-0.5 bg-white/10" aria-hidden="true" />

              {plan.itinerary.map(day => {
                const isCol = collapsed[day.dayIndex];
                const bb = budgetLabel(day.estimatedDailySpend, plan.intake?.budgetRange);
                const isToday = day.dayIndex === todayIndex;
                /*
                 * Whatever is pinned to the day itself. A link to an activity that
                 * is no longer anywhere in the plan lands here too, so a
                 * confirmation cannot disappear because the activity it described
                 * was deleted from under it.
                 */
                const dayClips = sortBySlot(linkedByDay.get(day.dayIndex) ?? [], c => c.time);
                const dayDate = dateForDayIndex(plan.startDate, day.dayIndex);
                const dayWeather = dayDate ? weatherByDate?.[dayDate] : undefined;
                const near = relativeDayLabel(plan.startDate, day.dayIndex);
                const color = getDayColor(day.dayIndex);
                // Only outdoor stops are tagged, and only on a day the weather can spoil.
                const hazard = dayWeather ? hazardsFor(dayWeather)[0] : undefined;
                const place = places[day.dayIndex] ?? plan.destination;
                const away = !sameCity(place, plan.destination);
                // The photo marks arriving somewhere, so a second day in the
                // same place does not repeat it.
                const arrives = away && (day.dayIndex === 0 || !sameCity(place, places[day.dayIndex - 1] ?? plan.destination));
                const dateText = shortDate(dayDate);
                const weekday = weekdayOf(dayDate);
                const kicker = [
                  dateText && !day.label.includes(dateText) ? dateText : null,
                  away ? place.split(',')[0].trim() : null,
                ].filter(Boolean).join(' · ');

                return (
                  <section
                    key={day.dayIndex}
                    id={`day-${day.dayIndex}`}
                    data-day-index={day.dayIndex}
                    aria-label={isToday ? `${day.label} (today)` : day.label}
                    data-testid={isToday ? 'today-section' : undefined}
                    className="relative grid grid-cols-[36px_minmax(0,1fr)] md:grid-cols-[48px_minmax(0,1fr)] gap-2.5 md:gap-5 scroll-mt-16"
                  >
                    <div
                      className={`relative z-[1] w-9 h-9 md:w-12 md:h-12 rounded-full grid place-items-center text-center leading-none border-2 shadow-[0_0_0_5px_var(--color-surface-base)] ${
                        isToday ? 'text-ink-inverse' : 'bg-surface-raised text-ink-primary'
                      }`}
                      style={{ borderColor: color, backgroundColor: isToday ? color : undefined }}
                      aria-hidden="true"
                    >
                      <span>
                        <span className="block text-sm md:text-base font-bold">{day.dayIndex + 1}</span>
                        {weekday && <span className="hidden md:block text-[9px] uppercase tracking-wide opacity-70 mt-0.5">{weekday}</span>}
                      </span>
                    </div>

                    <div className="min-w-0 rounded-card bg-surface-raised border border-white/10 shadow-card overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
                      {arrives && <DayPhoto place={place} />}

                      {/* Only when the weather can actually spoil something: a warning
                          on a wet day spent entirely in museums teaches people to
                          ignore the ones that are not wrong. */}
                      {dayWeather && hasOutdoorPlans(day) && weatherByDate && (
                        <WeatherAlertBadge
                          weather={dayWeather}
                          day={day}
                          allDays={plan.itinerary}
                          allWeather={weatherByDate}
                          planStartDate={plan.startDate}
                          plan={plan}
                          bookedDays={bookedDays}
                          intake={plan.intake ?? null}
                          isOffline={isOffline}
                          onGetSuggestions={(prompt) => askForSuggestions(day.dayIndex, prompt)}
                        />
                      )}
                      {suggesting === day.dayIndex && (
                        <p className="px-4 md:px-6 pt-2 text-xs text-ink-secondary" role="status">Asking the AI…</p>
                      )}
                      {suggestError && suggesting === null && dayWeather && hasOutdoorPlans(day) && (
                        <p className="px-4 md:px-6 pt-2 text-xs text-status-danger" role="alert" data-testid="weather-suggest-error">{suggestError}</p>
                      )}

                      <h2 className="m-0">
                        <button
                          className="w-full flex items-start gap-3 px-4 md:px-6 pt-4 pb-3 text-left"
                          onClick={() => setCollapsed(p => ({ ...p, [day.dayIndex]: !p[day.dayIndex] }))}
                          aria-expanded={!isCol}>
                          <span className="flex-1 min-w-0">
                            {kicker && (
                              <span className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color }}>{kicker}</span>
                            )}
                            <span className="block font-display font-semibold text-xl md:text-2xl leading-tight text-ink-primary break-words">{day.label}</span>
                          </span>
                          <span className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                            <span className="flex items-center gap-1.5">
                              {near && (
                                <span
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                    near === 'Today' ? 'bg-accent text-ink-inverse' : 'bg-white/5 text-ink-secondary'
                                  }`}
                                  data-testid={`day-relative-${day.dayIndex}`}
                                >
                                  {near}
                                </span>
                              )}
                              {isCol ? <ChevronRight size={16} className="text-ink-muted" /> : <ChevronDown size={16} className="text-ink-muted" />}
                            </span>
                            {bb && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bb.warn ? 'text-status-warning bg-status-warning/10' : 'text-accent bg-accent/10'}`}>{bb.text}</span>}
                          </span>
                        </button>
                      </h2>

                      {dayWeather && (
                        <div className="px-4 md:px-6 -mt-1">
                          <WeatherStrip weather={dayWeather} useFahrenheit={useFahrenheit} isToday={isToday} />
                        </div>
                      )}

                      {!isCol && (
                        <div className="space-y-2 px-4 md:px-6 pb-4">
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
                                weatherTag={hazard && isLikelyOutdoor(act)
                                  ? { label: HAZARD[hazard].stop, Icon: HAZARD[hazard].Icon, className: HAZARD[hazard].text }
                                  : undefined}
                                onDel={() => delAct(day.dayIndex, act.id)}
                                onUpd={u => updAct(day.dayIndex, act.id, u)}
                                onPin={() => pinAct(day.dayIndex, act)} />

                              {/* Joined to the card above rather than listed after it:
                                  the confirmation and the plan it belongs to are one
                                  thing, and they move together because the link is to
                                  the activity itself. */}
                              {(attachedByActivity.get(act.id) ?? []).map(c => (
                                <LinkedClipboardCard
                                  key={c.id}
                                  item={c}
                                  attached
                                  onOpen={() => navigate(`/plan/${plan.id}/clipboard/${c.id}?from=itinerary`)}
                                />
                              ))}
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
                                  plan={plan}
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

                          <AddInline siblings={day.activities} plan={plan} dayLabel={day.label}
                            seedSlot={seedSlotFor(sortByTime(day.activities).slice(-1)[0])}
                            onAdd={(name, time, loc, notes) => addAct(day.dayIndex, name, time, loc, notes)} />
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            {hasSide && (
              <div className="hidden xl:block xl:sticky xl:top-16 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto">
                <TripSidePanel plan={plan} todos={todoList} clips={clipList} onNavigate={navigate} />
              </div>
            )}
          </div>
        </div>
      </div>

      {suggestions && (
        <WeatherSuggestionsPanel
          plan={plan}
          affectedDayIndex={suggestions.dayIndex}
          suggestions={suggestions.items}
          onClose={() => setSuggestions(null)}
          onToast={(msg, undo) => setToast({ msg, undo })}
        />
      )}

      {toast && <Toast message={toast.msg} onDismiss={() => setToast(null)} action={toast.undo ? { label: 'Undo', onClick: toast.undo } : undefined} />}
    </div>
  );
}
