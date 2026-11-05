import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Bus, Car, ChevronDown, ChevronRight, LocateFixed, Plane, Ship, TrainFront, X } from 'lucide-react';
import { db, type Plan, type TravelMode, type TripLeg, type TripStop } from '../../db';
import { MAX_TRIP_DAYS, MAX_TRIP_DAYS_ERROR, exceedsMaxTripDays, maxEndDate } from '../../utils/tripDuration';
import { isPlausibleDestination, DESTINATION_ERROR, type DestinationSuggestion } from '../../services/destinations';
import { lookupCity } from '../../services/cityLookup';
import { guessOrigin, locateOrigin, LocationError } from '../../services/origin';
import { suggestModes, needsTicket } from '../../utils/travelSuggest';
import { tripStartTodos } from '../../utils/tripStartTodos';
import { fieldClass } from '../ui/formStyles';
import { airportForCity, airportLabel } from '../../data/airports';
import { StopsFields } from './TripDetailsFields';
import PlaceField from './PlaceField';

interface Props {
  onClose: () => void;
}

/** A place as the form knows it: what is shown, and where it is when known. */
interface Spot {
  label: string;
  city: string;
  country: string | null;
  countryCode?: string | null;
  coordinates?: [number, number];
}

const MODES: { id: TravelMode; label: string; icon: React.ReactNode; tickets: string }[] = [
  { id: 'flight', label: 'Flight', icon: <Plane size={16} />, tickets: 'flights' },
  { id: 'train', label: 'Train', icon: <TrainFront size={16} />, tickets: 'train tickets' },
  { id: 'car', label: 'Car', icon: <Car size={16} />, tickets: '' },
  { id: 'bus', label: 'Bus', icon: <Bus size={16} />, tickets: 'bus tickets' },
  { id: 'ferry', label: 'Ferry', icon: <Ship size={16} />, tickets: 'ferry tickets' },
];

const fromSuggestion = (s: DestinationSuggestion): Spot => ({
  label: s.label, city: s.city, country: s.country, countryCode: s.countryCode, coordinates: s.coordinates,
});

/** Where a typed or picked place is, looked up when the pick did not say. */
function useLocated(spot: Spot | null, text: string): Spot | null {
  const [found, setFound] = useState<Spot | null>(null);
  useEffect(() => {
    if (spot?.coordinates) { setFound(spot); return; }
    // Forget the last place at once: until the new lookup lands, a quick
    // Create would otherwise save the previous place's country.
    setFound(null);
    const q = (spot?.label ?? text).trim();
    if (q.length < 2) { setFound(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      const c = await lookupCity(q);
      if (live) {
        setFound(c ? { label: spot?.label ?? q, city: spot?.city ?? c.name, country: spot?.country ?? c.country, countryCode: c.countryCode, coordinates: c.coordinates } : null);
      }
    }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [spot, text]);
  return found;
}

/** A row of large choices: one tap each, at thumb size. */
function Choice<T extends string>({ value, options, onChange, label, testId }: {
  value: T | null;
  options: { id: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`min-h-11 flex items-center gap-2 px-4 rounded-xl border text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none ${
            value === o.id
              ? 'bg-accent/15 border-accent text-ink-primary'
              : 'border-white/10 text-ink-secondary hover:text-ink-primary'
          }`}
          data-testid={`${testId}-${o.id}`}
        >
          {o.icon && <span className="text-accent" aria-hidden="true">{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}

const label = 'block text-sm font-medium text-ink-secondary mb-1.5';

/**
 * Making a trip, phone first.
 *
 * From, to and when; then how you are getting there — offered from the
 * distance, so Toronto to Tokyo offers a flight and Toronto to Montréal a
 * train first — and whether the tickets and the stay are booked. What is not
 * booked becomes a to-do in Essentials; booked tickets get their times on
 * the itinerary and a place to keep them.
 *
 * It used to be destination, dates, a Domestic / International / Not sure
 * question and two collapsed sections of travel fields asking for the mode
 * of each leg from all six. Whether the trip crosses a border now follows
 * from where it starts and ends.
 */
export default function NewPlanModal({ onClose }: Props) {
  const navigate = useNavigate();

  // ── From ────────────────────────────────────────────────────────────
  const [originText, setOriginText] = useState('');
  const [originPick, setOriginPick] = useState<Spot | null>(null);
  const [originNote, setOriginNote] = useState('');
  // Once the traveller has typed or chosen, a late guess must not overwrite it.
  const originTouched = useRef(false);
  const setOriginTouched = (v: boolean) => { originTouched.current = v; };
  const [locating, setLocating] = useState(false);

  // Suggested from the time zone: no prompt, and only until the traveller types.
  useEffect(() => {
    let live = true;
    guessOrigin().then((c) => {
      if (!live || !c || originTouched.current) return;
      setOriginText(c.label);
      setOriginPick({ label: c.label, city: c.name, country: c.country, countryCode: c.countryCode, coordinates: c.coordinates });
      setOriginNote('Suggested from your time zone');
    });
    return () => { live = false; };
  }, []);

  const useMyLocation = async () => {
    setLocating(true);
    setOriginNote('');
    try {
      const c = await locateOrigin();
      setOriginTouched(true);
      setOriginText(c.label);
      setOriginPick({ label: c.label, city: c.name, country: c.country, countryCode: c.countryCode, coordinates: c.coordinates });
      setOriginNote('Your location');
    } catch (e) {
      setOriginNote(e instanceof LocationError ? e.message : 'Could not find your location.');
    } finally {
      setLocating(false);
    }
  };

  // ── To and when ─────────────────────────────────────────────────────
  const [destText, setDestText] = useState('');
  const [destPick, setDestPick] = useState<Spot | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const origin = useLocated(originPick, originText);
  const dest = useLocated(destPick, destText);

  // ── Getting there ───────────────────────────────────────────────────
  const suggested = useMemo(() => (origin && dest ? suggestModes(origin, dest) : []), [origin, dest]);
  const [mode, setMode] = useState<TravelMode | null>(null);
  const [allModes, setAllModes] = useState(false);
  const [oneWay, setOneWay] = useState(false);
  const shownModes = suggested.length && !allModes
    ? MODES.filter((m) => suggested.includes(m.id)).sort((a, b) => suggested.indexOf(a.id) - suggested.indexOf(b.id))
    : MODES;
  // A choice the suggestions no longer include stays chosen, and shown.
  const modeOptions = mode && !shownModes.some((m) => m.id === mode) ? [...shownModes, MODES.find((m) => m.id === mode)!] : shownModes;
  const tickets = mode ? MODES.find((m) => m.id === mode)!.tickets : '';

  const [ticketsBooked, setTicketsBooked] = useState<'yes' | 'no' | null>(null);
  const [outDate, setOutDate] = useState<string | null>(null);
  const [outTime, setOutTime] = useState('');
  const [retDate, setRetDate] = useState<string | null>(null);
  const [retTime, setRetTime] = useState('');
  // Follow the trip dates until changed by hand: an overnight flight may leave the day before.
  const outbound = outDate ?? startDate;
  const inbound = retDate ?? endDate;

  const [stayBooked, setStayBooked] = useState<'yes' | 'no' | null>(null);
  const [showStops, setShowStops] = useState(false);
  const [stops, setStops] = useState<TripStop[]>([]);

  // One way has no end date: the trip starts as its first day, and grows when
  // dates are changed later (Trip details adds the days).
  const effectiveEnd = oneWay ? startDate : endDate;
  const tooLong = exceedsMaxTripDays(startDate, effectiveEnd);
  const endBeforeStart = !!(startDate && effectiveEnd && effectiveEnd < startDate);
  const endDateError = (endBeforeStart ? 'End date must be after start date' : '') || (tooLong ? MAX_TRIP_DAYS_ERROR : '') || errors.endDate || '';

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!destText.trim()) errs.destination = 'Destination is required';
    else if (!isPlausibleDestination(destText)) errs.destination = DESTINATION_ERROR;
    if (endBeforeStart) errs.endDate = 'End date must be after start date';
    else if (tooLong) errs.endDate = MAX_TRIP_DAYS_ERROR;
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      const destination = destText.trim();
      const destCity = dest?.city ?? destination.split(',')[0].trim();
      const country = dest?.country ?? destPick?.country ?? null;
      const booked = ticketsBooked === 'yes';
      // A flight lands at an airport, whose city is not always the destination
      // (Kyoto's is in Osaka). Known airports are filled in; others are left.
      const airport = mode === 'flight' ? airportForCity(destination) : null;
      const leg = (date: string, time: string): TripLeg => {
        const l: TripLeg = { mode: mode!, city: airport?.city ?? destCity };
        if (airport) l.airport = airportLabel(airport);
        if (country) l.country = country;
        if (date) l.date = date;
        // Times only for a booked ticket: anything else would be a guess.
        if (booked && time) l.time = time;
        return l;
      };
      const originCode = origin?.countryCode;
      const destCode = dest?.countryCode;
      const cleanStops = stops.filter((s) => s.city.trim()).map((s) => ({ ...s, city: s.city.trim() }));
      const originText_ = originText.trim();

      const plan: Plan = {
        id: uuidv4(),
        name: destination,
        destination,
        ...(country ? { country } : {}),
        ...(destCode ? { countryCode: destCode } : {}),
        startDate: startDate || today,
        endDate: effectiveEnd || startDate || today,
        ...(originText_ ? {
          origin: {
            label: originText_,
            city: origin?.city ?? originText_.split(',')[0].trim(),
            ...(origin?.country ? { country: origin.country } : {}),
            ...(originCode ? { countryCode: originCode } : {}),
            ...(origin?.coordinates ? { coordinates: origin.coordinates } : {}),
          },
        } : {}),
        ...(mode ? { arrival: leg(outbound, outTime) } : {}),
        ...(mode && !oneWay ? { departure: leg(inbound, retTime) } : {}),
        ...(cleanStops.length ? { stops: cleanStops } : {}),
        // Across a border when the two countries differ; unknown when either is.
        ...(originCode && destCode ? { international: originCode !== destCode } : {}),
        ...(mode ? { booked: { travel: !needsTicket(mode) || booked, stay: stayBooked === 'yes' } } : {}),
        createdAt: now,
        updatedAt: now,
        deleted: false,
        itinerary: [],
      };
      await db.plans.add(plan);

      const todos = tripStartTodos(plan.id, {
        mode: mode ?? undefined,
        destination,
        ticketsBooked: booked,
        stayBooked: stayBooked === 'yes' ? true : stayBooked === 'no' ? false : null,
        international: plan.international,
        countries: { destination: destCode ?? country, origin: originCode ?? plan.origin?.country },
      }).map((t) => ({ ...t, id: uuidv4(), createdAt: now, updatedAt: now }));
      if (todos.length) await db.todos.bulkAdd(todos);

      navigate(`/plan/${plan.id}/itinerary`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="w-full max-w-lg mx-auto md:max-h-[85vh] md:overflow-y-auto scroll-rounded md:bg-surface-overlay md:border md:border-white/10 md:rounded-modal md:shadow-glass"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-plan-title"
      data-testid="new-plan-modal"
    >
      <form onSubmit={handleSubmit} noValidate className="px-4 pt-4 pb-28 md:p-6 md:pb-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 id="new-plan-title" className="text-xl font-semibold text-ink-primary">New trip</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 -mr-2 grid place-items-center rounded-xl text-ink-muted hover:text-ink-primary hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label="Close modal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* From */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="origin" className={label}>From</label>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="min-h-11 -my-3 flex items-center gap-1.5 text-sm text-accent hover:underline disabled:opacity-50"
              data-testid="use-my-location"
            >
              <LocateFixed size={14} aria-hidden="true" /> {locating ? 'Finding you…' : 'Use my location'}
            </button>
          </div>
          <PlaceField
            id="origin"
            value={originText}
            onChange={(t) => { setOriginText(t); setOriginPick(null); setOriginTouched(true); setOriginNote(''); }}
            onPick={(s) => { setOriginText(s.label); setOriginPick(fromSuggestion(s)); setOriginTouched(true); setOriginNote(''); }}
            placeholder="Where you're starting from"
            testId="origin-input"
            describedBy="origin-note"
          />
          {originNote && <p id="origin-note" className="mt-1 text-xs text-ink-muted" data-testid="origin-note">{originNote}</p>}
        </div>

        {/* To */}
        <div>
          <label htmlFor="destination" className={label}>To</label>
          <PlaceField
            id="destination"
            value={destText}
            onChange={(t) => { setDestText(t); setDestPick(null); if (errors.destination) setErrors((p) => ({ ...p, destination: '' })); }}
            onPick={(s) => { setDestText(s.label); setDestPick(fromSuggestion(s)); setErrors((p) => ({ ...p, destination: '' })); }}
            placeholder="e.g. Tokyo, Japan"
            invalid={!!errors.destination}
            describedBy={errors.destination ? 'destination-error' : undefined}
            testId="destination-input"
          />
          {errors.destination && <p id="destination-error" role="alert" className="mt-1 text-xs text-status-danger">{errors.destination}</p>}
        </div>

        {/* When. Round trip sits with the dates because it decides whether
            there is an end date to ask for: one way, and the end slides away. */}
        <div>
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-sm font-medium text-ink-secondary">When</p>
          <label className="min-h-11 -my-3 flex items-center gap-2 text-sm text-ink-secondary cursor-pointer">
            <input type="checkbox" checked={!oneWay} onChange={(e) => setOneWay(!e.target.checked)}
              className="w-5 h-5 accent-cyan-500" data-testid="round-trip" />
            Round trip
          </label>
        </div>
        <div
          className={`grid transition-[grid-template-columns,column-gap] duration-300 ease-out ${oneWay ? 'gap-x-0' : 'gap-x-3'}`}
          style={{ gridTemplateColumns: oneWay ? '1fr 0fr' : '1fr 1fr' }}
          data-testid="trip-dates"
        >
          <div className="min-w-0">
            <label htmlFor="start-date" className={label}>{oneWay ? 'Date' : 'Start Date'}</label>
            <input id="start-date" type="date" value={startDate}
              onChange={(e) => { setStartDate(e.target.value); if (errors.endDate) setErrors((p) => ({ ...p, endDate: '' })); }}
              className={`${fieldClass} text-base md:text-sm`} data-testid="start-date-input" />
          </div>
          <div className={`min-w-0 overflow-hidden transition-opacity duration-300 ${oneWay ? 'opacity-0' : 'opacity-100'}`} aria-hidden={oneWay || undefined}>
            <label htmlFor="end-date" className={`${label} whitespace-nowrap`}>End Date</label>
            <input id="end-date" type="date" value={endDate}
              min={startDate || undefined} max={maxEndDate(startDate) || undefined}
              onChange={(e) => { setEndDate(e.target.value); if (errors.endDate) setErrors((p) => ({ ...p, endDate: '' })); }}
              className={`${fieldClass} text-base md:text-sm`}
              aria-describedby={endDateError ? 'end-date-error' : 'end-date-help'}
              disabled={oneWay}
              tabIndex={oneWay ? -1 : undefined}
              data-testid="end-date-input" />
          </div>
        </div>
        {!oneWay && (endDateError ? (
          <p id="end-date-error" role="alert" className="mt-1 text-xs text-status-danger" data-testid="end-date-error">{endDateError}</p>
        ) : (
          <p id="end-date-help" className="mt-1 text-xs text-ink-muted">
            Up to {MAX_TRIP_DAYS} days{startDate ? ` — latest ${maxEndDate(startDate)}` : ''}
          </p>
        ))}
        </div>

        {/* Getting there */}
        <div className="space-y-3" data-testid="getting-there">
          <p className={label}>Getting there</p>
          <Choice value={mode} options={modeOptions} onChange={(m) => { setMode(m); setTicketsBooked(null); }} label="How you're travelling" testId="mode" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {suggested.length > 0 && suggested.length < MODES.length && (
              <button type="button" onClick={() => setAllModes((v) => !v)} className="min-h-11 text-sm text-ink-muted hover:text-ink-primary" data-testid="more-modes">
                {allModes ? 'Fewer options' : 'Other ways'}
              </button>
            )}
          </div>
        </div>

        {mode && tickets && (
          <div className="space-y-3" data-testid="tickets-question">
            <p className={label}>Are your {tickets} booked?</p>
            <Choice value={ticketsBooked} options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'Not yet' }]} onChange={setTicketsBooked} label={`Are your ${tickets} booked?`} testId="tickets-booked" />
            {ticketsBooked === 'yes' && (
              <div className="space-y-3 rounded-card border border-white/10 p-3" data-testid="ticket-times">
                <LegTime idPrefix="out" title={`To ${dest?.city ?? (destText.split(',')[0] || 'there')}`} date={outbound} time={outTime} onDate={setOutDate} onTime={setOutTime} />
                {!oneWay && (
                  <LegTime idPrefix="ret" title="Back home" date={inbound} time={retTime} onDate={setRetDate} onTime={setRetTime} />
                )}
                <p className="text-xs text-ink-muted">Times are optional. You can add the tickets themselves in Essentials.</p>
              </div>
            )}
          </div>
        )}

        {/* Where you're staying */}
        <div className="space-y-3" data-testid="stay-question">
          <p className={label}>
            Is your stay booked? <span className="font-normal text-ink-muted">Optional</span>
          </p>
          <Choice value={stayBooked} options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'Not yet' }]} onChange={setStayBooked} label="Is your stay booked?" testId="stay-booked" />
        </div>

        <div className="border-t border-white/5 pt-3">
          <button type="button" onClick={() => setShowStops((v) => !v)}
            className="min-h-11 w-full flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary"
            aria-expanded={showStops} data-testid="toggle-stops">
            {showStops ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            More cities
            {stops.length > 0 && <span className="text-xs text-accent">{stops.length}</span>}
            <span className="text-xs text-ink-muted ml-auto">Optional</span>
          </button>
          {showStops && <div className="mt-3"><StopsFields stops={stops} onChange={setStops} /></div>}
        </div>

        {/* Fixed to the bottom on a phone, where the thumb is; in the flow on a wide screen. */}
        <div className="fixed md:static inset-x-0 bottom-0 z-20 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:p-0 bg-surface-base/95 md:bg-transparent border-t border-white/10 md:border-0">
          <button
            type="submit"
            disabled={saving || tooLong}
            className="w-full min-h-12 bg-accent hover:bg-accent-light disabled:opacity-60 disabled:cursor-not-allowed text-ink-inverse font-semibold rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            data-testid="create-plan-btn"
          >
            {saving ? 'Creating…' : 'Create trip'}
          </button>
        </div>
      </form>
    </div>
  );
}

function LegTime({ idPrefix, title, date, time, onDate, onTime }: {
  idPrefix: string; title: string; date: string; time: string;
  onDate: (d: string) => void; onTime: (t: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm text-ink-primary mb-1.5">{title}</legend>
      {/* Sized by wrappers: the shared field style is full width, which let
          the time take the whole row and squeezed the date to nothing. */}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <input type="date" value={date} onChange={(e) => onDate(e.target.value)} aria-label={`${title}: date`}
            className={`${fieldClass} text-base md:text-sm`} data-testid={`${idPrefix}-date`} />
        </div>
        <div className="w-32 shrink-0">
          <input type="time" value={time} onChange={(e) => onTime(e.target.value)} aria-label={`${title}: time`}
            className={`${fieldClass} text-base md:text-sm`} data-testid={`${idPrefix}-time`} />
        </div>
      </div>
    </fieldset>
  );
}
