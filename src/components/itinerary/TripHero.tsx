import type { ReactNode } from 'react';
import { Cloud, Sun } from 'lucide-react';
import type { Plan } from '../../db';
import type { WeatherDay } from '../../store';
import { usePlacePhoto } from '../../hooks/usePlacePhoto';
import { tripRoute } from '../../utils/travel';
import { tripDayCount } from '../../utils/tripDuration';
import { dateForDayIndex, type TripTiming } from '../../utils/tripDay';
import { hazardsFor, toFahrenheit, wmoToDescription, type WeatherHazard } from '../../utils/weatherUtils';
import { HAZARD } from './weatherHazard';
import { dateRange, dayOfWeekAndDate } from '../../utils/dateText';

interface Props {
  plan: Plan;
  timing: TripTiming;
  todayIndex: number | null;
  weatherByDate: Record<string, WeatherDay> | null;
  useFahrenheit: boolean;
  /** Why there is no forecast, when there is none and the user can fix it. */
  forecastNote?: ReactNode;
  onJumpToDay: (dayIndex: number) => void;
}

const BUDGET: Record<string, string> = {
  budget: 'Budget',
  mid: 'Mid budget',
  premium: 'Premium',
  luxury: 'Luxury',
};

/** Photo tiles past this scroll; a fortnight of tiles would bury the picture. */
const MAX_HAZARD_CHIPS = 4;

/** "street food, temples and anime" */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The line under the title, from what the traveller said in intake. Nothing
 * at all when they said nothing, rather than a sentence of filler.
 */
function summaryFor(plan: Plan): string | null {
  const likes = (plan.intake?.likes ?? []).filter(Boolean).slice(0, 4);
  const dislikes = (plan.intake?.dislikes ?? []).filter(Boolean).slice(0, 2);
  if (!likes.length && !dislikes.length) return null;
  const parts: string[] = [];
  if (likes.length) parts.push(`Built around ${listOf(likes)}`);
  if (dislikes.length) parts.push(`${likes.length ? 'steering' : 'Steering'} clear of ${listOf(dislikes)}`);
  return `${parts.join(', ')}.`;
}

export function timingText(timing: TripTiming, todayIndex: number | null): string | null {
  switch (timing.status) {
    case 'upcoming':
      return timing.daysUntil === 0 ? 'Starts today'
        : timing.daysUntil === 1 ? 'Starts tomorrow'
        : `Starts in ${timing.daysUntil} days`;
    case 'active':
      return `Day ${(todayIndex ?? 0) + 1} of your trip` +
        (timing.daysRemaining ? ` · ${timing.daysRemaining} day${timing.daysRemaining === 1 ? '' : 's'} to go` : '');
    case 'past':
      return 'This trip has ended';
    default:
      return null;
  }
}

interface ForecastDay {
  dayIndex: number;
  date: string;
  weather: WeatherDay;
  hazards: WeatherHazard[];
}

/**
 * The top of a trip: what it is and when, on one side; where, on the other.
 *
 * The photo is the destination's, and the weather sits on it — a warning for
 * each day something could spoil, and the forecast along the bottom — because
 * "is it going to rain on us" is the question people open a trip to answer.
 */
export default function TripHero({
  plan, timing, todayIndex, weatherByDate, useFahrenheit, forecastNote, onJumpToDay,
}: Props) {
  const photo = usePlacePhoto(plan.destination);
  const route = tripRoute(plan).map((c) => c.split(',')[0].trim());
  const days = tripDayCount(plan.startDate, plan.endDate);
  const nights = days && days > 1 ? days - 1 : null;
  const dates = dateRange(plan.startDate, plan.endDate);
  const summary = summaryFor(plan);
  const when = timingText(timing, todayIndex);
  const travellers = plan.intake?.numTravellers;
  const budget = plan.intake?.budgetRange ? BUDGET[plan.intake.budgetRange] : null;

  const forecast: ForecastDay[] = [];
  for (const day of plan.itinerary) {
    const date = dateForDayIndex(plan.startDate, day.dayIndex);
    const weather = date ? weatherByDate?.[date] : undefined;
    if (date && weather) forecast.push({ dayIndex: day.dayIndex, date, weather, hazards: hazardsFor(weather) });
  }
  const chips = forecast
    .flatMap((f) => f.hazards.map((h) => ({ hazard: h, day: f })))
    .slice(0, MAX_HAZARD_CHIPS);
  const temp = (c: number) => (useFahrenheit ? `${toFahrenheit(c)}°` : `${Math.round(c)}°`);

  return (
    <section
      className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] rounded-card overflow-hidden border border-white/10 bg-surface-raised shadow-card"
      aria-labelledby="trip-title"
      data-testid="trip-hero"
    >
      <div className="p-6 md:p-10 flex flex-col justify-center min-w-0">
        <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.12em] uppercase text-accent-light">
          <span className="w-7 h-0.5 bg-accent shrink-0" aria-hidden="true" />
          <span className="truncate">{route.length > 1 ? route.join(' · ') : plan.destination}</span>
        </p>
        <h1
          id="trip-title"
          className="font-display font-semibold text-ink-primary text-[2.1rem] md:text-5xl leading-[1.05] tracking-tight mt-4 mb-3 break-words"
        >
          {plan.name}
        </h1>
        {summary && <p className="text-ink-secondary text-sm md:text-base max-w-[52ch]">{summary}</p>}
        <div className="flex flex-wrap gap-2 mt-5">
          {dates && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full border border-white/15 bg-surface-overlay text-ink-primary">
              {dates}{nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
            </span>
          )}
          {when && (
            <span
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                timing.status === 'active'
                  ? 'border-accent bg-accent/15 text-accent-light'
                  : 'border-white/15 bg-surface-overlay text-ink-secondary'
              }`}
              data-testid="trip-timing"
            >
              {when}
            </span>
          )}
          {!!travellers && (
            <span className="text-xs px-3 py-1.5 rounded-full border border-white/15 bg-surface-overlay text-ink-secondary">
              {travellers} traveller{travellers === 1 ? '' : 's'}
            </span>
          )}
          {budget && (
            <span className="text-xs px-3 py-1.5 rounded-full border border-white/15 bg-surface-overlay text-ink-secondary">
              {budget}
            </span>
          )}
        </div>
      </div>

      <figure className="relative m-0 min-h-[300px] md:min-h-[360px] overflow-hidden bg-gradient-to-br from-[#0f2236] via-[#0b1322] to-[#1b1533]" data-testid="trip-photo">
        {photo ? (
          <img
            src={photo.src}
            alt={`${photo.title}`}
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="trip-photo-img"
          />
        ) : (
          /* No picture found (or none yet): the place's name stands in, so
             the panel still says where the trip is. */
          <div className="absolute inset-0 flex items-center justify-center p-6" aria-hidden="true">
            <span className="font-display font-semibold text-4xl md:text-5xl text-white/10 text-center break-words">
              {plan.destination.split(',')[0]}
            </span>
          </div>
        )}
        {/* Dark at the top and bottom, where the text sits; the middle is left
            to the picture. */}
        <div
          className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(10,15,26,.55)_0%,transparent_34%,transparent_48%,rgba(10,15,26,.9)_100%)]"
          aria-hidden="true"
        />

        <div className="absolute inset-0 p-4 md:p-5 flex flex-col justify-between gap-3">
          <div className="flex flex-col items-start gap-1.5" aria-label="Weather alerts">
            {chips.map(({ hazard, day }) => {
              const h = HAZARD[hazard];
              return (
                <button
                  key={`${day.dayIndex}-${hazard}`}
                  type="button"
                  onClick={() => onJumpToDay(day.dayIndex)}
                  className={`inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full text-xs font-semibold text-ink-primary bg-surface-base/70 backdrop-blur-glass border ${h.border} hover:bg-surface-base/90 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none`}
                  data-testid="hero-weather-alert"
                  data-hazard={hazard}
                >
                  <h.Icon size={14} className={h.text} aria-hidden="true" />
                  {h.title}
                  {' '}<span className="font-normal text-ink-secondary">· {dayOfWeekAndDate(day.date)}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {forecast.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" aria-label="Forecast">
                {forecast.map((f) => {
                  const lead = f.hazards[0];
                  const h = lead ? HAZARD[lead] : null;
                  const Icon = h ? h.Icon : f.weather.weatherCode <= 1 ? Sun : Cloud;
                  const detail = !h ? wmoToDescription(f.weather.weatherCode)
                    : lead === 'wind' ? `${Math.round(f.weather.windspeedMax)} km/h`
                    : `${h.short} ${f.weather.precipProbability}%`;
                  return (
                    <div
                      key={f.date}
                      className={`shrink-0 min-w-[84px] flex-1 rounded-xl px-3 py-2 backdrop-blur-glass border ${
                        h ? `${h.border} ${h.tint}` : 'border-white/15 bg-surface-base/60'
                      }`}
                      data-testid="hero-forecast-day"
                    >
                      <p className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
                        {dayOfWeekAndDate(f.date)}
                        <Icon size={13} className={h ? h.text : 'text-ink-secondary'} aria-hidden="true" />
                      </p>
                      <p className="text-lg font-bold text-ink-primary leading-tight">{temp(f.weather.tempMax)}</p>
                      <p className={`text-[11px] truncate ${h ? h.text : 'text-ink-secondary'}`}>{detail}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              forecastNote && (
                <div className="rounded-xl px-3 py-2 bg-surface-base/70 backdrop-blur-glass border border-white/10">
                  {forecastNote}
                </div>
              )
            )}
            {photo && (
              <figcaption className="text-right text-[10px] text-ink-primary/60">
                <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ink-primary">
                  Photo · Wikipedia
                </a>
              </figcaption>
            )}
          </div>
        </div>
      </figure>
    </section>
  );
}
