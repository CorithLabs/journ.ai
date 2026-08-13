import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, MapPin, CheckCircle2, CircleAlert, ArrowRight, Sparkles } from 'lucide-react';
import { db, type Plan } from '../../db';
import { slotLabel, exactTime, formatTime } from '../../utils/activityTime';
import { tripTiming } from '../../utils/tripDay';
import { readiness, todayGlance, tripRecord, dateOfDay } from '../../utils/tripPhase';
import type { WeatherDay } from '../../store';
import { wmoToDescription, toFahrenheit } from '../../utils/weatherUtils';
import { getTempUnit } from '../../services/units';

/**
 * The top of the trip, which says something different in each of its phases.
 *
 * This replaced a single line of text — "Day 4 of your trip · 3 days to go" —
 * that was the same shape whether the trip was three weeks away, happening
 * around the traveller, or over. `tripTiming` had known which of the three
 * applied since it was written, and nothing but that one line read it.
 *
 * A spike: it sits at the top of the itinerary rather than replacing the tabs,
 * so the question it answers — is a phase-shaped home worth restructuring the
 * app for — can be answered by using it.
 */
export default function TripPhasePanel({
  plan,
  weatherByDate,
  onGoToDay,
}: {
  plan: Plan;
  weatherByDate?: Record<string, WeatherDay> | null;
  onGoToDay: (dayIndex: number) => void;
}) {
  const todos = useLiveQuery(() => db.todos.where('planId').equals(plan.id).toArray(), [plan.id]);
  const timing = tripTiming(plan);

  if (timing.status === 'unknown') return null;

  return (
    <div className="px-4 pt-3 shrink-0" data-testid="trip-phase" data-phase={timing.status}>
      <div className="rounded-card border border-white/10 bg-surface-raised/60 p-3">
        {timing.status === 'upcoming' && (
          <Upcoming plan={plan} todos={todos ?? []} daysUntil={timing.daysUntil} onGoToDay={onGoToDay} />
        )}
        {timing.status === 'active' && (
          <Active plan={plan} weatherByDate={weatherByDate} timing={timing} onGoToDay={onGoToDay} />
        )}
        {timing.status === 'past' && <Past plan={plan} />}
      </div>
    </div>
  );
}

/** A number and what it counts, sized so the number is read first. */
function Stat({ value, label, tone = 'plain' }: { value: string; label: string; tone?: 'plain' | 'warn' }) {
  return (
    <div className="min-w-0">
      <p className={`text-lg font-semibold tabular-nums ${tone === 'warn' ? 'text-status-warning' : 'text-ink-primary'}`}>
        {value}
      </p>
      <p className="text-xs text-ink-muted truncate">{label}</p>
    </div>
  );
}

/**
 * Before departure the question is "am I ready", and every line here is
 * something that can still be done about it.
 */
function Upcoming({
  plan, todos, daysUntil, onGoToDay,
}: {
  plan: Plan;
  todos: import('../../db').TodoItem[];
  daysUntil: number | null;
  onGoToDay: (dayIndex: number) => void;
}) {
  const r = readiness(plan, todos);
  const planned = r.totalDays - r.emptyDays.length;

  return (
    <div className="space-y-3" data-testid="phase-upcoming">
      <div className="flex items-baseline gap-2">
        <CalendarClock size={16} className="text-accent shrink-0" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink-primary" data-testid="phase-headline">
          {daysUntil === 0 ? 'You leave today'
            : daysUntil === 1 ? 'You leave tomorrow'
            : `${daysUntil} days to go`}
        </h3>
      </div>

      <div className="flex items-start gap-6">
        <Stat value={`${planned}/${r.totalDays}`} label="days planned" />
        <Stat value={`${r.doneTodos}/${r.doneTodos + r.openTodos}`} label="tasks done" />
        {r.overdue.length > 0 && (
          <Stat value={String(r.overdue.length)} label="overdue" tone="warn" />
        )}
      </div>

      {/* One next step, not a list. A readiness panel that names five problems
          is a fifth as likely to get any of them fixed. */}
      {r.firstEmptyDay !== null ? (
        <button
          onClick={() => onGoToDay(r.firstEmptyDay!)}
          className="flex items-center gap-1.5 text-xs text-accent hover:underline"
          data-testid="phase-next-step"
        >
          <Sparkles size={12} aria-hidden="true" />
          Day {r.firstEmptyDay + 1} has nothing on it yet
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      ) : r.overdue.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-status-warning" data-testid="phase-next-step">
          <CircleAlert size={12} aria-hidden="true" />
          {r.overdue[0].title} was due {r.overdue[0].dueDate}
        </p>
      ) : r.nextDue ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-secondary" data-testid="phase-next-step">
          <CalendarClock size={12} aria-hidden="true" />
          Next: {r.nextDue.title} by {r.nextDue.dueDate}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-status-success" data-testid="phase-next-step">
          <CheckCircle2 size={12} aria-hidden="true" /> Every day has something on it, and nothing is outstanding.
        </p>
      )}
    </div>
  );
}

/**
 * During the trip the question is "what now, and where" — which a list read
 * from the top cannot answer, because at 6pm the top of today is this morning.
 */
function Active({
  plan, weatherByDate, timing, onGoToDay,
}: {
  plan: Plan;
  weatherByDate?: Record<string, WeatherDay> | null;
  timing: ReturnType<typeof tripTiming>;
  onGoToDay: (dayIndex: number) => void;
}) {
  const glance = todayGlance(plan);
  if (!glance) return null;

  const date = dateOfDay(plan, glance.dayIndex);
  const weather = date ? weatherByDate?.[date] : null;
  const upNext = glance.now[0] ?? glance.later[0] ?? null;

  return (
    <div className="space-y-3" data-testid="phase-active">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-ink-primary" data-testid="phase-headline">
          Day {glance.dayIndex + 1} of {plan.itinerary.length}
        </h3>
        {glance.city && (
          <span className="flex items-center gap-1 text-xs text-ink-secondary">
            <MapPin size={12} aria-hidden="true" /> {glance.city}
          </span>
        )}
        {weather && (
          <span className="text-xs text-ink-secondary tabular-nums" data-testid="phase-weather">
            {getTempUnit() === 'F'
              ? `${toFahrenheit(weather.tempMax)}°F`
              : `${Math.round(weather.tempMax)}°C`}
            {' · '}{wmoToDescription(weather.weatherCode)}
          </span>
        )}
        {timing.daysRemaining != null && (
          <span className="text-xs text-ink-muted ml-auto">
            {timing.daysRemaining} day{timing.daysRemaining === 1 ? '' : 's'} left
          </span>
        )}
      </div>

      {/* The one thing a traveller standing in a street wants. */}
      {upNext ? (
        <button
          onClick={() => onGoToDay(glance.dayIndex)}
          className="w-full text-left rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 hover:bg-accent/10 transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          data-testid="phase-up-next"
        >
          <span className="text-[11px] font-semibold text-accent uppercase tracking-wider">
            {glance.now.length ? 'Now' : 'Up next'}
          </span>
          <span className="block text-sm text-ink-primary font-medium mt-0.5">{upNext.name}</span>
          <span className="block text-xs text-ink-muted mt-0.5">
            {slotLabel(upNext.time)}
            {exactTime(upNext.time) && ` · ${formatTime(upNext.time)}`}
            {upNext.locationName && ` · ${upNext.locationName}`}
          </span>
        </button>
      ) : (
        <p className="text-xs text-ink-muted" data-testid="phase-up-next">
          {glance.done.length
            ? 'Nothing else planned today.'
            : 'Nothing planned today.'}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-muted">
        {glance.later.length > 0 && (
          <span data-testid="phase-later">
            {glance.later.length} more today
          </span>
        )}
        {glance.tomorrow && (
          <button
            onClick={() => onGoToDay(glance.tomorrow!.dayIndex)}
            className="flex items-center gap-1 hover:text-ink-secondary"
            data-testid="phase-tomorrow"
          >
            Tomorrow: {glance.tomorrow.activities.length} planned
            <ArrowRight size={11} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/** After it, there is no question — and every prompt to plan is now noise. */
function Past({ plan }: { plan: Plan }) {
  const r = tripRecord(plan);

  return (
    <div className="space-y-3" data-testid="phase-past">
      <h3 className="text-sm font-semibold text-ink-primary" data-testid="phase-headline">
        {r.endedDaysAgo === 0 ? 'Back today'
          : r.endedDaysAgo === 1 ? 'Back yesterday'
          : r.endedDaysAgo != null ? `Back ${r.endedDaysAgo} days ago`
          : 'This trip has ended'}
      </h3>

      <div className="flex items-start gap-6">
        <Stat value={String(r.days)} label={`day${r.days === 1 ? '' : 's'}`} />
        <Stat value={String(r.activities)} label="things done" />
        {r.cities.length > 0 && <Stat value={String(r.cities.length)} label="places" />}
      </div>

      {r.cities.length > 0 && (
        <p className="text-xs text-ink-secondary" data-testid="phase-route">
          {r.cities.join(' → ')}
        </p>
      )}
    </div>
  );
}
