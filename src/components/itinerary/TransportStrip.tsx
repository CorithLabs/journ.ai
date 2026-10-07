import { Bus, Car, Plane, Ship, TrainFront, Route, type LucideIcon } from 'lucide-react';
import type { Plan, TravelMode, TripLeg } from '../../db';
import { formatTime } from '../../utils/activityTime';
import { shortDate } from '../../utils/dateText';

const MODE_ICON: Record<TravelMode, LucideIcon> = {
  flight: Plane,
  train: TrainFront,
  bus: Bus,
  car: Car,
  ferry: Ship,
  other: Route,
};

const MODE_NAME: Record<TravelMode, string> = {
  flight: 'Flight',
  train: 'Train',
  bus: 'Bus',
  car: 'Drive',
  ferry: 'Ferry',
  other: 'Travel',
};

function hasAnything(leg?: TripLeg): leg is TripLeg {
  return !!leg && !!(leg.city?.trim() || leg.airport?.trim() || leg.date || leg.time);
}

function Leg({ leg, verb }: { leg: TripLeg; verb: 'Arrive' | 'Leave' }) {
  const Icon = MODE_ICON[leg.mode ?? 'other'];
  const where = leg.airport?.trim() || leg.city?.trim() || '';
  const sub = [shortDate(leg.date), leg.mode ? MODE_NAME[leg.mode] : null, leg.airport && leg.city ? leg.city.split(',')[0] : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="px-5 py-4 min-w-0" data-testid={`transport-${verb === 'Arrive' ? 'arrival' : 'departure'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-ink-primary min-w-0">
          <Icon size={16} className="text-accent-light shrink-0 self-center" aria-hidden="true" />
          <span className="truncate">{verb}{where ? ` · ${where}` : ''}</span>
        </p>
        {leg.time ? (
          <span className="font-bold tabular-nums text-ink-primary shrink-0">{formatTime(leg.time)}</span>
        ) : (
          <span className="text-xs font-semibold text-status-warning shrink-0">Time not set</span>
        )}
      </div>
      {sub && <p className="text-xs text-ink-secondary mt-1 truncate">{sub}</p>}
    </div>
  );
}

/**
 * Getting there and getting home, under the hero.
 *
 * These are the two fixed points everything else hangs from — a 22:40 arrival
 * rules out the first evening — so they get a strip of their own rather than
 * hiding in trip details. Nothing at all when neither has been filled in.
 */
export default function TransportStrip({ plan }: { plan: Plan }) {
  const arrival = hasAnything(plan.arrival) ? plan.arrival : null;
  const departure = hasAnything(plan.departure) ? plan.departure : null;
  if (!arrival && !departure) return null;

  return (
    <section
      aria-label="Getting there and back"
      className={`grid ${arrival && departure ? 'sm:grid-cols-2' : ''} divide-y sm:divide-y-0 sm:divide-x divide-accent/20 rounded-card overflow-hidden border border-accent/30 bg-gradient-to-r from-accent/15 to-accent-sky/5`}
      data-testid="transport-strip"
    >
      {arrival && <Leg leg={arrival} verb="Arrive" />}
      {departure && <Leg leg={departure} verb="Leave" />}
    </section>
  );
}
