import { useEffect, useRef, useState } from 'react';
import {
  Accessibility, AlertTriangle, BookOpen, Clock, ExternalLink, Globe, Lightbulb, Phone,
  RefreshCw, Sparkles, Ticket, Timer, Utensils, Languages, NotebookPen,
} from 'lucide-react';
import type { Activity, Plan } from '../../db';
import { useAppStore } from '../../store';
import { factsQuery, fetchPlaceFacts, type PlaceFacts } from '../../services/placeFacts';
import { askAboutPlace, askPlaceGuide, type GuideContext, type PlaceGuide } from '../../services/placeGuide';
import { getActiveProvider, keyStorageFor, MissingKeyError } from '../../services/aiClient';
import { hasStoredKey } from '../../services/aiKey';
import { dateForDayIndex } from '../../utils/tripDay';
import { exactTime, formatTime, slotLabel } from '../../utils/activityTime';
import { wmoToDescription } from '../../utils/weatherUtils';
import { shortDate } from '../../utils/dateText';
import { closedOn, readableHours } from '../../utils/openingHours';

type About = NonNullable<Activity['about']>;

interface Props {
  act: Activity;
  plan: Pick<Plan, 'destination' | 'country'> & Partial<Pick<Plan, 'startDate' | 'itinerary' | 'intake'>>;
  /** Keep what was found with the activity. */
  onSave: (about: About) => void;
  /** Append a line to the activity's notes. */
  onAddNote: (text: string) => void;
}

const QUESTIONS = ['Good for kids?', 'Where to eat nearby?', 'What if it rains?', 'How do I get there?'];

const BUDGET: Record<string, string> = {
  budget: 'budget', mid: 'mid-range', premium: 'premium', luxury: 'luxury',
};

/** The visit as the AI should see it: the day, the forecast, who is going. */
function contextFor(act: Activity, plan: Props['plan'], weatherByDate: ReturnType<typeof useAppStore.getState>['weatherByDate']): GuideContext {
  const day = plan.itinerary?.find((d) => d.activities.some((a) => a.id === act.id));
  const date = day && plan.startDate ? dateForDayIndex(plan.startDate, day.dayIndex) ?? undefined : undefined;
  const w = date ? weatherByDate?.[date] : undefined;
  const when = exactTime(act.time) ? `${slotLabel(act.time)}, ${formatTime(act.time)}` : slotLabel(act.time);
  return {
    name: act.name,
    location: act.locationName || undefined,
    address: act.address,
    destination: plan.destination,
    date,
    when,
    weather: w
      ? `${wmoToDescription(w.weatherCode)}, high ${Math.round(w.tempMax)}°C, ${w.precipProbability}% chance of rain, wind up to ${Math.round(w.windspeedMax)} km/h`
      : undefined,
    travellers: plan.intake
      ? { count: plan.intake.numTravellers, kids: plan.intake.kids, kidAges: plan.intake.kidAges }
      : undefined,
    likes: plan.intake?.likes,
    dislikes: plan.intake?.dislikes,
    budget: plan.intake?.budgetRange ? BUDGET[plan.intake.budgetRange] : null,
    notes: act.notes || undefined,
  };
}

function hasKey(): boolean {
  try {
    return hasStoredKey(keyStorageFor(getActiveProvider()));
  } catch {
    return false;
  }
}

/**
 * About this place, inside an activity's details.
 *
 * Two layers, kept apart so it is always clear which is which:
 *
 *   - What the checked sources say — Wikipedia's account of the place, and
 *     OpenStreetMap's hours, fee, access and local name. Fetched on its own
 *     the first time the details are opened; free, and needs no key.
 *   - The AI guide, on request: what to see, how long, when to go, what to
 *     know — about this visit, on this day, for these people. Labelled as AI.
 *
 * Both are kept with the activity, so the next open is instant, works
 * offline, and does not ask the AI the same question twice.
 */
export default function AboutPlace({ act, plan, onSave, onAddNote }: Props) {
  const weatherByDate = useAppStore((s) => s.weatherByDate);
  const [facts, setFacts] = useState<PlaceFacts | undefined>(act.about?.facts);
  const [guide, setGuide] = useState<PlaceGuide | undefined>(act.about?.guide);
  const [loadingFacts, setLoadingFacts] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Array<{ q: string; a?: string; saved?: boolean }>>([]);
  const keyed = hasKey();
  const online = typeof navigator === 'undefined' || navigator.onLine;

  // Saves merge into the latest of both, so a guide arriving after the facts
  // does not write the facts away again.
  const latest = useRef<About>({ ...act.about });
  const save = (patch: Partial<About>) => {
    latest.current = { ...latest.current, ...patch };
    onSave(latest.current);
  };

  const place = {
    name: act.name,
    coordinates: act.coordinates,
    city: plan.destination.split(',')[0],
    location: act.locationName,
  };

  /*
   * Kept facts are used as they are, unless they are not worth keeping:
   *   - the last lookup did not reach every source (offline, a timeout),
   *     so "nothing found" there meant "nobody answered";
   *   - the stop has been renamed or moved since;
   *   - they are an empty answer saved before lookups recorded either of
   *     those, which may be exactly that kind of miss.
   */
  const kept = act.about?.facts;
  const stale = !kept
    || kept.complete === false
    || (kept.query !== undefined && kept.query !== factsQuery(place))
    || (kept.query === undefined && !kept.wiki && !kept.map);

  const lookUp = () => {
    let live = true;
    setLoadingFacts(true);
    fetchPlaceFacts(place).then((found) => {
      if (!live) return;
      setLoadingFacts(false);
      setFacts(found);
      save({ facts: found });
    });
    return () => { live = false; };
  };

  useEffect(() => {
    if (!stale || !online || !act.name.trim()) return;
    return lookUp();
    // Once per opening: the facts do not change while the details are open.
  }, [act.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const askGuide = async () => {
    setAsking(true);
    setError('');
    try {
      const g = await askPlaceGuide(contextFor(act, plan, weatherByDate), facts);
      setGuide(g);
      save({ guide: g });
    } catch (e) {
      setError(e instanceof MissingKeyError ? 'Add an AI key in Settings to use the guide.' : e instanceof Error ? e.message : 'Could not reach the AI.');
    } finally {
      setAsking(false);
    }
  };

  const ask = async (q: string) => {
    setAnswers((prev) => [...prev.filter((x) => x.q !== q), { q }]);
    try {
      const a = await askAboutPlace(q, contextFor(act, plan, weatherByDate), facts);
      setAnswers((prev) => prev.map((x) => (x.q === q ? { q, a } : x)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach the AI.';
      setAnswers((prev) => prev.map((x) => (x.q === q ? { q, a: msg } : x)));
    }
  };

  const m = facts?.map;
  // Checked without AI: the hours say closed, on the day it is planned for.
  const visitDate = contextFor(act, plan, weatherByDate).date;
  const closure = closedOn(m?.openingHours, visitDate);
  const checked = facts?.checkedAt ? shortDate(facts.checkedAt.slice(0, 10)) : null;
  const nothingFound = facts && !facts.wiki && !facts.map;
  // An empty answer only counts as one when every source answered.
  const unreached = nothingFound && facts.complete === false;

  return (
    <section className="mt-4 pt-4 border-t border-white/10 space-y-4" aria-labelledby={`about-${act.id}`} data-testid="about-place">
      <h3 id={`about-${act.id}`} className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
        <BookOpen size={15} className="text-accent" aria-hidden="true" />
        About this place
      </h3>

      {/* ── What the sources say ─────────────────────────────── */}
      {loadingFacts && (
        <div className="space-y-2 animate-pulse" data-testid="about-loading" aria-label="Looking this place up">
          <div className="h-3 bg-white/10 rounded w-full" />
          <div className="h-3 bg-white/10 rounded w-5/6" />
          <div className="h-3 bg-white/10 rounded w-2/3" />
        </div>
      )}

      {!facts && !loadingFacts && !online && (
        <p className="text-xs text-ink-muted">Available when you are online.</p>
      )}

      {facts?.wiki && (
        <div className="flex gap-3" data-testid="about-wiki">
          {facts.wiki.image && (
            <img src={facts.wiki.image} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" loading="lazy" />
          )}
          <div className="min-w-0">
            <p className="text-sm text-ink-secondary leading-relaxed line-clamp-5">{facts.wiki.extract}</p>
            <a href={facts.wiki.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-xs text-accent hover:underline">
              Wikipedia: {facts.wiki.title} <ExternalLink size={11} aria-hidden="true" />
            </a>
          </div>
        </div>
      )}

      {closure && visitDate && (
        <p className="flex gap-2 text-sm text-status-warning rounded-xl border border-status-warning/30 bg-status-warning/10 px-3 py-2" role="alert" data-testid="about-closed">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{closure.reason}, and it is planned for {shortDate(visitDate)}.</span>
        </p>
      )}

      {m?.openingHours && (
        <div className="flex gap-2 text-xs text-ink-secondary" data-testid="about-hours">
          <Clock size={13} className="shrink-0 mt-0.5 text-accent" aria-hidden="true" />
          <ul className="space-y-0.5">
            {readableHours(m.openingHours).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}

      {m && (
        <ul className="flex flex-wrap gap-1.5" data-testid="about-map-facts">
          {m.fee && <Fact icon={<Ticket size={12} />} label="Entry fee" value={m.fee === 'no' ? 'Free' : m.fee === 'yes' ? 'Paid' : m.fee} />}
          {m.wheelchair && <Fact icon={<Accessibility size={12} />} label="Wheelchair" value={m.wheelchair} />}
          {m.cuisine && <Fact icon={<Utensils size={12} />} label="Food" value={m.cuisine} />}
          {m.localName && <Fact icon={<Languages size={12} />} label="Local name" value={m.localName} />}
          {m.website && (
            <li>
              <a href={m.website} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-white/10 text-accent hover:bg-accent/10">
                <Globe size={12} aria-hidden="true" /> Website
              </a>
            </li>
          )}
          {m.phone && (
            <li>
              <a href={`tel:${m.phone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-white/10 text-accent hover:bg-accent/10">
                <Phone size={12} aria-hidden="true" /> {m.phone}
              </a>
            </li>
          )}
        </ul>
      )}

      {nothingFound && !loadingFacts && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xs text-ink-muted" data-testid={unreached ? 'about-unreached' : 'about-nothing'}>
            {unreached
              ? 'Could not reach Wikipedia or OpenStreetMap just now.'
              : 'Wikipedia and OpenStreetMap have nothing under this name.'}
          </p>
          {online && (
            <button type="button" onClick={lookUp} className="text-xs text-accent hover:underline" data-testid="about-check-again">
              Check again
            </button>
          )}
        </div>
      )}
      {facts && !nothingFound && (
        <p className="text-[11px] text-ink-muted">
          From {[facts.wiki && 'Wikipedia', facts.map && 'OpenStreetMap'].filter(Boolean).join(' and ')}
          {checked ? `, checked ${checked}` : ''}. Hours and prices change: check before you go.
        </p>
      )}

      {/* ── The AI guide ─────────────────────────────────────── */}
      {guide ? (
        <div className="rounded-xl border border-accent/25 bg-accent/5 p-3.5 space-y-3" data-testid="about-guide">
          {/* Said plainly when there was nothing to check it against, so the
              guide does not read as confirming what the sources could not. */}
          {nothingFound && (
            <p className="text-[11px] text-ink-muted" data-testid="about-guide-unchecked">
              From the AI's general knowledge. No checked source to compare it with.
            </p>
          )}
          {guide.heads && guide.heads.length > 0 && (
            <ul className="space-y-1" data-testid="about-heads">
              {guide.heads.map((h) => (
                <li key={h} className="flex gap-2 text-sm text-status-warning">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> {h}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-primary leading-relaxed">{guide.about}</p>
          {guide.highlights.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">Don't miss</p>
              <ul className="space-y-1 list-disc pl-5 text-sm text-ink-secondary marker:text-accent">
                {guide.highlights.map((h) => <li key={h}>{h}</li>)}
              </ul>
            </div>
          )}
          {(guide.duration || guide.bestTime) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
              {guide.duration && <span className="flex items-center gap-1"><Timer size={12} className="text-accent" aria-hidden="true" /> {guide.duration}</span>}
              {guide.bestTime && <span className="flex items-center gap-1"><Clock size={12} className="text-accent" aria-hidden="true" /> {guide.bestTime}</span>}
            </div>
          )}
          {guide.tips.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">Good to know</p>
              <ul className="space-y-1">
                {guide.tips.map((t) => (
                  <li key={t} className="flex gap-2 text-sm text-ink-secondary">
                    <Lightbulb size={13} className="shrink-0 mt-0.5 text-category-amber" aria-hidden="true" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-ink-muted flex items-center gap-1">
              <Sparkles size={11} aria-hidden="true" /> AI guide · may be wrong
            </p>
            {keyed && online && (
              <button type="button" onClick={askGuide} disabled={asking}
                className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-accent disabled:opacity-40"
                data-testid="about-refresh">
                <RefreshCw size={11} className={asking ? 'animate-spin' : ''} aria-hidden="true" /> {asking ? 'Asking…' : 'Ask again'}
              </button>
            )}
          </div>
        </div>
      ) : keyed ? (
        <button
          type="button"
          onClick={askGuide}
          disabled={asking || !online || loadingFacts}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-ink-inverse font-semibold text-sm transition-colors disabled:opacity-50"
          data-testid="about-ask-guide"
        >
          <Sparkles size={15} aria-hidden="true" />
          {asking ? 'Asking the guide…' : loadingFacts ? 'Looking it up…' : 'What to see, when to go, what to know'}
        </button>
      ) : (
        <p className="text-xs text-ink-muted" data-testid="about-needs-key">
          <Sparkles size={12} className="inline mr-1 text-accent" aria-hidden="true" />
          Add an AI key in <a href="/settings" className="text-accent hover:underline">Settings</a> for a guide to this place.
        </p>
      )}

      {error && <p className="text-xs text-status-danger" role="alert">{error}</p>}

      {/* ── Follow-up questions ──────────────────────────────── */}
      {keyed && online && (guide || facts) && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ask about this place">
            {QUESTIONS.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-ink-secondary hover:text-ink-primary hover:border-accent/50"
                data-testid="about-question">
                {q}
              </button>
            ))}
          </div>
          {answers.map(({ q, a, saved }) => (
            <div key={q} className="rounded-xl bg-surface-overlay border border-white/10 p-3" data-testid="about-answer">
              <p className="text-xs font-semibold text-ink-primary mb-1">{q}</p>
              {a ? (
                <>
                  <p className="text-sm text-ink-secondary leading-relaxed">{a}</p>
                  <button
                    type="button"
                    disabled={saved}
                    onClick={() => {
                      onAddNote(`${q} ${a}`);
                      setAnswers((prev) => prev.map((x) => (x.q === q ? { ...x, saved: true } : x)));
                    }}
                    className="mt-2 flex items-center gap-1 text-[11px] text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
                    data-testid="about-save-answer"
                  >
                    <NotebookPen size={11} aria-hidden="true" /> {saved ? 'Added to notes' : 'Add to notes'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-ink-muted animate-pulse">Asking…</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-white/10 text-ink-secondary">
      <span className="text-accent" aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}: </span>
      {value}
    </li>
  );
}
