import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { db, type Plan } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import StartManualButton from './StartManualButton';
import { hasAnyAiKey } from '../../services/aiKeyStatus';

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
  bookings: {
    values: ['Both booked', 'Flights only', 'Accommodation only', 'Neither'],
  },
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
  bookings: 'Have you already booked your flights and/or accommodation?',
  done: "Great — I have everything I need! Click below to generate your itinerary.",
};

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
  });
  const [saving, setSaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        const flightsBooked = /flight/i.test(value) || /both/i.test(value) || /yes/i.test(value);
        const accommodationBooked = /hotel/i.test(value) || /accomm/i.test(value) || /both/i.test(value) || /yes/i.test(value);
        const newIntake = { ...intake, flightsBooked, accommodationBooked };
        setIntake(newIntake);
        // Save and finish
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
    advance('bookings');
  };

  const saveIntake = async (finalIntake: typeof intake) => {
    setSaving(true);
    try {
      await db.plans.update(plan.id, {
        intake: finalIntake,
        updatedAt: new Date().toISOString(),
      });

      // Auto-create todo items for unbooked flights/accommodation
      const todoItems = [];
      if (!finalIntake.flightsBooked) {
        todoItems.push({
          id: uuidv4(),
          planId: plan.id,
          title: `Book flights to ${plan.destination}`,
          category: 'Booking' as const,
          status: 'todo' as const,
          autoGenerated: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      if (!finalIntake.accommodationBooked) {
        todoItems.push({
          id: uuidv4(),
          planId: plan.id,
          title: 'Book accommodation for each night',
          category: 'Booking' as const,
          status: 'todo' as const,
          autoGenerated: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      if (todoItems.length > 0) {
        await db.todos.bulkAdd(todoItems);
        addMessage(
          'assistant',
          `I'll add booking tasks to your To-Do list. ${todoItems.map((t) => `"${t.title}"`).join(' and ')} ${todoItems.length > 1 ? 'have' : 'has'} been added.`,
        );
      }

      if (finalIntake.kids) {
        const kidTask = {
          id: uuidv4(),
          planId: plan.id,
          title: `Check child entry requirements for ${plan.destination}`,
          category: 'Document' as const,
          status: 'todo' as const,
          autoGenerated: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.todos.add(kidTask);
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
          <div className="flex flex-wrap gap-2 pl-8" data-testid="intake-suggestions">
            {STEP_SUGGESTIONS[step]!.values.map((value) => (
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
                  setInput((prev) => {
                    const parts = prev.split(',').map((s) => s.trim()).filter(Boolean);
                    if (parts.includes(value)) return prev; // already chosen
                    return [...parts, value].join(', ');
                  });
                }}
                className="px-3 py-1.5 rounded-full bg-surface-overlay border border-white/10 text-xs text-ink-secondary hover:text-ink-primary hover:border-accent/40 transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
                data-testid={`intake-suggestion-${value}`}
              >
                {value}
              </button>
            ))}
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
              className="flex-1 bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
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
