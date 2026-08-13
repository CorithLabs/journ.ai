import { useState, useRef, useEffect } from 'react';
import { travelNoun } from '../../utils/travel';
import { autoGenerateTodos } from './generateTodos';
import { Send, Sparkles } from 'lucide-react';
import { db, type Plan } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import StartManualButton from './StartManualButton';
import { hasAnyAiKey } from '../../services/aiKeyStatus';
import { scrollBehavior } from '../../utils/motion';
import Button from '../ui/Button';
import { fieldOnCardAuto } from '../ui/formStyles';

interface Props {
  plan: Plan;
}

type IntakeStep =
  | 'numTravellers'
  | 'kids'
  | 'kidAges'
  | 'likes'
  | 'dislikes'
  | 'budget'
  | 'bookings'
  | 'visa'
  | 'done';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
}

const BUDGET_OPTIONS = [
  { value: 'budget', label: 'Budget (< $100/day per person)' },
  { value: 'mid', label: 'Mid-range ($100–$300/day per person)' },
  { value: 'premium', label: 'Premium ($300–$600/day per person)' },
  { value: 'luxury', label: 'Luxury ($600+/day per person)' },
];

/**
 * Tappable answers per question, so the intake isn't a bare text box.
 *
 * `multi` steps append into the input with a comma and wait — likes and
 * dislikes take several values, so tapping one must not submit the answer.
 * Single-value steps submit immediately, matching how budget already behaves.
 */
const STEP_SUGGESTIONS: Partial<Record<IntakeStep, { values: string[]; multi?: boolean }>> = {
  numTravellers: { values: ['1', '2', '3', '4', '5'] },
  kids: { values: ['Yes', 'No'] },
  kidAges: { values: ['skip'] },
  likes: {
    multi: true,
    values: [
      'street food', 'museums', 'temples', 'hiking', 'beaches',
      'nightlife', 'shopping', 'art galleries', 'live music', 'markets',
    ],
  },
  dislikes: {
    multi: true,
    values: ['crowds', 'early starts', 'long walks', 'spicy food', 'museums', 'skip'],
  },
  // Replaced at runtime — see bookingOptions(). A road trip has no tickets,
  // so it is asked about accommodation alone.
  bookings: {
    values: ['Both booked', 'Travel only', 'Accommodation only', 'Neither'],
  },
  visa: { values: ['Yes', 'No', 'Not sure'] },
};

const STEP_MESSAGES: Record<IntakeStep, string> = {
  numTravellers: "Let's build your trip! How many people are travelling?",
  kids: 'Are any of the travellers children? (yes / no)',
  kidAges:
    "Great! What are their ages? (Enter comma-separated numbers, e.g. '4, 8')",
  likes:
    "What kinds of activities do you enjoy? (e.g. 'street food, hiking, museums')",
  dislikes:
    "Anything you'd like to avoid? (e.g. 'crowds, spicy food') — type 'skip' if none",
  budget: 'What is your budget range? (per person, per day)',
  // Replaced at runtime with the right noun — see bookingQuestion().
  bookings: 'Have you already booked your travel and/or accommodation?',
  // Replaced at runtime with the country name — see visaQuestion().
  visa: 'Do you need a visa for this trip?',
  done: "Great — I have everything I need! Click below to generate your itinerary.",
};

/**
 * Read a bookings answer whatever noun the chips happened to use.
 *
 * The chips differ by travel mode — "Train tickets only", "Flights only",
 * plain "Booked" for a road trip — and the answer can also be typed freely.
 */
function parseBookings(value: string): { travel: boolean; accommodation: boolean } {
  const v = value.toLowerCase().trim();
  if (/both/.test(v)) return { travel: true, accommodation: true };
  if (/neither|none|not yet|^no/.test(v)) return { travel: false, accommodation: false };

  const accommodation = /accomm|hotel|stay/.test(v);
  const travel = /flight|ticket|train|bus|ferry|travel|car/.test(v);
  // "Booked" or "Yes" answers a question that only asked about one thing.
  if (!accommodation && !travel) {
    const yes = /^(yes|booked|done)/.test(v);
    return { travel: yes, accommodation: yes };
  }
  return { travel, accommodation };
}

export default function IntakeChat({ plan }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uuidv4(),
      role: 'assistant',
      content: STEP_MESSAGES.numTravellers,
    },
  ]);
  const needsKey = !hasAnyAiKey();
  const [step, setStep] = useState<IntakeStep>('numTravellers');
  const [input, setInput] = useState('');
  const [intake, setIntake] = useState({
    numTravellers: null as number | null,
    kids: null as boolean | null,
    kidAges: null as number[] | null,
    likes: [] as string[],
    dislikes: [] as string[],
    budgetRange: null as 'budget' | 'mid' | 'premium' | 'luxury' | null,
    flightsBooked: null as boolean | null,
    accommodationBooked: null as boolean | null,
    needsVisa: null as boolean | null,
  });

  /**
   * Visas are issued by countries, so ask about the country when one was
   * resolved at plan creation. A free-typed destination has none, so fall back
   * to a generic phrasing rather than naming the city and being wrong.
   */
  const visaQuestion = () =>
    plan.country
      ? `Last one — do you need a visa to visit ${plan.country}?`
      : 'Last one — do you need a visa for this trip?';

  /*
   * "Have you booked your flights?" has no answer on a road trip, and names
   * the wrong thing on a train. Both the question and its chips follow the
   * mode the user gave when the plan was created.
   */
  const travelThing = travelNoun(plan.arrival?.mode);

  const bookingQuestion = () =>
    travelThing
      ? `Have you already booked your ${travelThing} and/or accommodation?`
      : 'Have you already booked your accommodation?';

  const bookingOptions = (): string[] => {
    if (!travelThing) return ['Booked', 'Not yet'];
    const only = travelThing.charAt(0).toUpperCase() + travelThing.slice(1);
    return ['Both booked', `${only} only`, 'Accommodation only', 'Neither'];
  };

  // A trip that stays inside one country has no visa to discuss, so it is not
  // asked about one — the question itself was part of the assumption.
  const asksVisa = plan.international !== false;
  const [saving, setSaving] = useState(false);
  /** What the chips have put in the box, so they can show it back. */
  const chosen = input.split(',').map((v) => v.trim()).filter(Boolean);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior() });
  }, [messages]);

  const addMessage = (role: 'assistant' | 'user', content: string) => {
    setMessages((prev) => [...prev, { id: uuidv4(), role, content }]);
  };

  const advance = (nextStep: IntakeStep, assistantMsg?: string) => {
    setStep(nextStep);
    if (assistantMsg) {
      addMessage('assistant', assistantMsg);
    } else if (nextStep !== 'done') {
      addMessage('assistant', STEP_MESSAGES[nextStep]);
    }
  };

  /** `override` lets a suggestion chip answer without typing into the input. */
  const handleSend = (override?: string) => {
    const value = (override ?? input).trim();
    if (!value) return;
    addMessage('user', value);
    setInput('');

    const skip = value.toLowerCase() === 'skip';

    switch (step) {
      case 'numTravellers': {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 1) {
          addMessage('assistant', 'Please enter a valid number of travellers.');
          return;
        }
        setIntake((prev) => ({ ...prev, numTravellers: n }));
        advance('kids');
        break;
      }
      case 'kids': {
        const yes = /^y/i.test(value);
        setIntake((prev) => ({ ...prev, kids: yes }));
        advance(yes ? 'kidAges' : 'likes');
        break;
      }
      case 'kidAges': {
        if (skip) {
          setIntake((prev) => ({ ...prev, kidAges: null }));
          advance('likes');
          return;
        }
        const ages = value
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        setIntake((prev) => ({ ...prev, kidAges: ages }));
        advance('likes');
        break;
      }
      case 'likes': {
        if (skip) {
          advance('dislikes');
          return;
        }
        const likes = value.split(',').map((s) => s.trim()).filter(Boolean);
        setIntake((prev) => ({ ...prev, likes }));
        advance('dislikes');
        break;
      }
      case 'dislikes': {
        if (skip) {
          setIntake((prev) => ({ ...prev, dislikes: [] }));
        } else {
          const dislikes = value.split(',').map((s) => s.trim()).filter(Boolean);
          setIntake((prev) => ({ ...prev, dislikes }));
        }
        advance('budget');
        break;
      }
      case 'bookings': {
        const { travel, accommodation } = parseBookings(value);
        const next = { ...intake, flightsBooked: travel, accommodationBooked: accommodation };
        setIntake(next);
        if (asksVisa) {
          advance('visa', visaQuestion());
        } else {
          // Nothing left to ask: a domestic trip skips the visa question, so
          // the intake is complete here.
          const finalIntake = { ...next, needsVisa: false };
          setIntake(finalIntake);
          saveIntake(finalIntake);
        }
        break;
      }
      case 'visa': {
        // "Not sure" stays null on purpose — it produces a check-the-rules
        // reminder rather than an apply-for-one task.
        const needsVisa = /^y/i.test(value) ? true : /^n(o|ope)?$/i.test(value.trim()) ? false : null;
        const newIntake = { ...intake, needsVisa };
        setIntake(newIntake);
        saveIntake(newIntake);
        break;
      }
      default:
        break;
    }
  };

  const handleBudgetSelect = (val: string) => {
    const budgetRange = val as 'budget' | 'mid' | 'premium' | 'luxury';
    addMessage('user', BUDGET_OPTIONS.find((o) => o.value === val)?.label ?? val);
    setIntake((prev) => ({ ...prev, budgetRange }));
    advance('bookings', bookingQuestion());
  };

  const saveIntake = async (finalIntake: typeof intake) => {
    setSaving(true);
    try {
      await db.plans.update(plan.id, {
        intake: finalIntake,
        updatedAt: new Date().toISOString(),
      });

      /*
       * One place decides what a trip needs. This used to build its own copy
       * of the booking tasks so it could name them in the chat, and the copy
       * drifted: it said "Book flights" whatever the mode, and checked child
       * entry requirements against the city rather than the country, with no
       * regard for whether the trip crossed a border at all.
       */
      const added = await autoGenerateTodos({ ...plan, intake: finalIntake });
      if (added.length > 0) {
        addMessage(
          'assistant',
          `I'll add these to your To-Do list: ${added.map((t) => `"${t}"`).join(', ')}.`,
        );
      }

      setStep('done');
      addMessage('assistant', STEP_MESSAGES.done);
    } finally {
      setSaving(false);
    }
  };

  /**
   * "Generate Itinerary →" CTA.
   *
   * This ONLY persists the completed intake to IndexedDB — it does NOT call
   * OpenAI. Once `intake.budgetRange` is set on the plan record, the
   * ItineraryTab state machine reactively routes to <GenerateItinerary>, which
   * owns the actual AI generation. Keeping this handler side-effect-free avoids
   * duplicate generation triggers and keeps the routing single-sourced in
   * ItineraryTab.
   */
  const handleGenerate = async () => {
    setSaving(true);
    try {
      await db.plans.update(plan.id, {
        intake,
        updatedAt: new Date().toISOString(),
      });
      // No navigation and no AI call here — ItineraryTab's useLiveQuery observes
      // the completed intake and renders <GenerateItinerary> automatically.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="intake-chat">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <span className="shrink-0 mr-2 mt-1">
                <Sparkles size={16} className="text-accent" aria-hidden="true" />
              </span>
            )}
            <div
              className={`max-w-sm rounded-xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-accent text-ink-inverse'
                  : 'bg-surface-overlay text-ink-primary border border-white/5'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Suggestion chips for the current question */}
        {STEP_SUGGESTIONS[step] && (
          <div className="flex flex-wrap items-center gap-2 pl-8" data-testid="intake-suggestions">
            {/* The bookings chips name what there is to book, which depends on
                how they are getting there. */}
            {(step === 'bookings' ? bookingOptions() : STEP_SUGGESTIONS[step]!.values).map((value) => {
              const isMulti = STEP_SUGGESTIONS[step]!.multi && value !== 'skip';
              const picked = isMulti && chosen.includes(value);
              return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  const cfg = STEP_SUGGESTIONS[step]!;
                  // 'skip' always answers outright, even on a multi step —
                  // appending it to other choices would be contradictory.
                  if (!cfg.multi || value === 'skip') {
                    handleSend(value);
                    return;
                  }
                  // Toggles. Once a chip looks chosen, tapping it again has to
                  // un-choose it — the old version silently did nothing, which
                  // reads as broken the moment the state is visible.
                  setInput((prev) => {
                    const parts = prev.split(',').map((s) => s.trim()).filter(Boolean);
                    const next = parts.includes(value)
                      ? parts.filter((p) => p !== value)
                      : [...parts, value];
                    return next.join(', ');
                  });
                }}
                aria-pressed={isMulti ? picked : undefined}
                className={`px-3 py-1.5 rounded-full border text-xs transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none ${
                  picked
                    ? 'bg-accent/15 border-accent/40 text-ink-primary font-medium'
                    : 'bg-surface-overlay border-white/10 text-ink-secondary hover:text-ink-primary hover:border-accent/40'
                }`}
                data-testid={`intake-suggestion-${value}`}
              >
                {value}
              </button>
              );
            })}

            {/* Answering meant reaching past the chips to the input at the
                bottom of the screen. The way to finish sits with the thing
                being answered. */}
            {STEP_SUGGESTIONS[step]!.multi && chosen.length > 0 && (
              <Button
                size="sm"
                onClick={() => handleSend()}
                data-testid="intake-send-chips"
              >
                Send {chosen.length}
              </Button>
            )}
          </div>
        )}

        {/* Budget quick-select */}
        {step === 'budget' && (
          <div className="flex flex-col gap-2 pl-8">
            {BUDGET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleBudgetSelect(opt.value)}
                className="text-left px-4 py-2 rounded-xl bg-surface-overlay border border-white/10 text-sm text-ink-secondary hover:text-ink-primary hover:border-accent/40 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Generate button */}
        {step === 'done' && (
          <div className="flex justify-center mt-4">
            <button
              onClick={handleGenerate}
              disabled={saving}
              className="flex items-center gap-2 bg-accent hover:bg-accent-light disabled:opacity-60 text-ink-inverse font-semibold px-6 py-2.5 rounded-xl transition-colors"
              data-testid="generate-itinerary-btn"
            >
              <Sparkles size={16} aria-hidden="true" />
              Generate Itinerary →
            </button>
          </div>
        )}

        {/* Manual escape. Without a key the AI questions lead nowhere, so it
            is presented as the main path rather than a footnote. */}
        <div className={`flex flex-col items-center gap-1 ${needsKey ? 'mt-4' : 'mt-6'}`}>
          {needsKey && (
            <p className="text-xs text-status-warning text-center max-w-xs" data-testid="intake-no-key">
              No AI key set up, so I can't build this for you — you can still
              plan it yourself, or add a key in Settings.
            </p>
          )}
          <StartManualButton plan={plan} variant={needsKey ? 'button' : 'link'} />
          {!needsKey && (
            <p className="text-[11px] text-ink-muted">Skip the questions and add activities yourself</p>
          )}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {step !== 'budget' && step !== 'done' && (
        <div className="px-4 py-3 border-t border-white/5 shrink-0">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer…"
              className={`flex-1 ${fieldOnCardAuto}`}
              data-testid="intake-input"
              aria-label="Answer"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2 rounded-xl bg-accent disabled:opacity-50 text-ink-inverse focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
              aria-label="Send"
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
