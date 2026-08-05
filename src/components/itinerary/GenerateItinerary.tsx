import { useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { type Plan, type Day, db } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import { autoGenerateTodos } from './generateTodos';
import { streamCompletion, MissingKeyError } from '../../services/aiClient';

interface Props {
  plan: Plan;
  onGenerated: () => void;
}

const BUDGET_RANGES: Record<string, string> = {
  budget: 'budget (< $100/person/day)',
  mid: 'mid ($100\u2013$300/person/day)',
  premium: 'premium ($300\u2013$600/person/day)',
  luxury: 'luxury ($600+/person/day)',
};

function buildPrompt(plan: Plan): string {
  const intake = plan.intake;
  const budgetLabel = intake?.budgetRange ? BUDGET_RANGES[intake.budgetRange] : 'mid ($100\u2013$300/person/day)';
  return [
    'You are a travel planner. Generate a detailed day-by-day itinerary.',
    'Return ONLY valid JSON matching the schema. No markdown, no extra text.',
    `Destination: ${plan.destination}`,
    `Dates: ${plan.startDate} to ${plan.endDate}`,
    `Travellers: ${intake?.numTravellers ?? 1}`,
    `Kids: ${intake?.kids ? 'yes, ages: ' + (intake.kidAges?.join(', ') ?? 'unknown (generate general family-friendly, age-appropriate activities)') : 'no'}`,
    `Likes: ${intake?.likes?.join(', ') || 'general sightseeing'}`,
    `Dislikes: ${intake?.dislikes?.join(', ') || 'none'}`,
    `Budget: ${budgetLabel}`,
    'Rules: keep activities within the stated budget tier. Set budgetWarning:true on any activity that may borderline or exceed the budget (err on the side of warning, not silence).',
    'If kids are present, all activities must be age-appropriate.',
    'Return estimatedDailySpend {min,max,currency:"USD"} per day using world-knowledge cost estimates.',
    'Schema: {"days":[{"dayIndex":0,"label":"Day 1","estimatedDailySpend":{"min":80,"max":150,"currency":"USD"},"activities":[{"id":"uuid","name":"...","time":"09:00","locationName":"...","notes":"...","budgetWarning":false}]}]}',
  ].join('\n');
}

function parseDaySpend(raw: unknown): { min: number; max: number; currency: 'USD' } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.min !== 'number' && typeof s.max !== 'number') return undefined;
  const a = typeof s.min === 'number' ? s.min : 0;
  const b = typeof s.max === 'number' ? s.max : 0;
  // If min > max, swap silently before storing.
  return { min: Math.min(a, b), max: Math.max(a, b), currency: 'USD' };
}

function validateAndParseDays(raw: unknown): Day[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.days) || obj.days.length === 0) return null;
  return obj.days.map((d: unknown, i: number) => {
    const day = d as Record<string, unknown>;
    return {
      dayIndex: typeof day.dayIndex === 'number' ? day.dayIndex : i,
      label: typeof day.label === 'string' ? day.label : `Day ${i + 1}`,
      estimatedDailySpend: parseDaySpend(day.estimatedDailySpend),
      activities: Array.isArray(day.activities)
        ? (day.activities as unknown[]).map((a: unknown) => {
            const act = a as Record<string, unknown>;
            return {
              id: typeof act.id === 'string' ? act.id : uuidv4(),
              name: typeof act.name === 'string' ? act.name : 'Activity',
              time: typeof act.time === 'string' ? act.time : '09:00',
              locationName: typeof act.locationName === 'string' ? act.locationName : '',
              notes: typeof act.notes === 'string' ? act.notes : '',
              pinnedToTodo: false,
              budgetWarning: act.budgetWarning === true,
            };
          })
        : [],
    };
  });
}

/**
 * Attempt to parse the AI's raw text into a validated Day[].
 * 1. Strip markdown code fences (```json ... ```) if present.
 * 2. Extract the first JSON object.
 * 3. Parse directly.
 * 4. On failure, apply a local trailing-comma repair and retry.
 * Returns null if the text cannot be coerced into a valid itinerary.
 */
function tryParseItinerary(text: string): Day[] | null {
  // gpt-4o-mini frequently wraps JSON in markdown fences; strip them first.
  const stripped = text.replace(/^```[a-z]*\n?/m, '').replace(/```\s*$/m, '');
  const m = stripped.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    try {
      parsed = JSON.parse(m[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
    } catch {
      return null;
    }
  }
  return validateAndParseDays(parsed);
}

export default function GenerateItinerary({ plan, onGenerated }: Props) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');

  const generate = async () => {
    setStatus('generating'); setError(null); setStreamText('');
    try {
      const prompt = buildPrompt(plan);
      // Provider-agnostic streaming — routes to OpenAI or Anthropic based on
      // the active provider preference. max_tokens 8000 (default) avoids
      // mid-JSON truncation for trips up to ~21 days.
      const fullText = await streamCompletion(
        [{ role: 'user', content: prompt }],
        { onToken: setStreamText },
      );

      // First attempt: extract + local repair.
      let days = tryParseItinerary(fullText);

      // Second attempt: ask the AI to repair its own malformed output with a
      // follow-up prompt before giving up (per acceptance criteria).
      if (!days) {
        const repaired = await streamCompletion(
          [
            { role: 'user', content: prompt },
            { role: 'assistant', content: fullText },
            {
              role: 'user',
              content:
                'Your previous response was not valid JSON matching the schema. ' +
                'Reply again with ONLY the corrected JSON object — no markdown, no prose, no code fences.',
            },
          ],
          { onToken: setStreamText },
        );
        days = tryParseItinerary(repaired);
      }

      // Still malformed → show error and keep the previous itinerary intact
      // (no write has happened, so nothing is lost).
      if (!days) throw new Error('The AI returned an itinerary we could not read. Your previous plan is unchanged — please retry.');

      await db.plans.update(plan.id, { itinerary: days, updatedAt: new Date().toISOString() });
      // Re-fetch the plan so autoGenerateTodos sees the freshly-written
      // itinerary (the `plan` prop still has the stale empty itinerary).
      const updatedPlan = await db.plans.get(plan.id);
      if (updatedPlan) await autoGenerateTodos(updatedPlan);
      onGenerated();
    } catch (err) {
      if (err instanceof MissingKeyError) {
        setError('No API key configured. Please add your API key in Settings.');
      } else if (err instanceof Error && err.message.startsWith('The response was too long')) {
        // Map the generic client message to an itinerary-specific one.
        setError('The itinerary was too long to generate in one response. Try a shorter trip (fewer days) or retry.');
      } else {
        setError(err instanceof Error ? err.message : 'Generation failed');
      }
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center" data-testid="generate-itinerary">
      <Sparkles size={40} className="text-accent mb-4" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-ink-primary mb-2">Ready to generate your itinerary</h2>
      <p className="text-sm text-ink-secondary mb-6 max-w-sm">
        The AI will create a personalised day-by-day plan for <strong className="text-ink-primary">{plan.destination}</strong> based on your preferences.
      </p>
      {plan.intake?.budgetRange && (
        <div className="mb-4 text-xs text-accent bg-accent/10 px-3 py-1.5 rounded-full">
          Budget: {BUDGET_RANGES[plan.intake.budgetRange]}
        </div>
      )}
      {status === 'generating' && (
        <div className="w-full max-w-lg mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-label="Generating" />
            <span className="text-sm text-ink-secondary">Generating your itinerary…</span>
          </div>
          {streamText && <div className="bg-surface-overlay rounded-xl p-3 text-xs text-ink-muted font-mono max-h-32 overflow-y-auto text-left">{streamText.slice(-500)}</div>}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-status-danger/10 border border-status-danger/20 rounded-xl max-w-sm">
          <AlertTriangle size={16} className="text-status-danger shrink-0 mt-0.5" />
          <div><p className="text-sm text-status-danger">{error}</p><button className="text-xs text-accent hover:underline mt-1" onClick={generate}>Retry</button></div>
        </div>
      )}
      {status !== 'generating' && (
        <button onClick={generate} className="flex items-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-6 py-2.5 rounded-xl transition-colors" data-testid="start-generate-btn">
          <Sparkles size={16} aria-hidden="true" /> Generate Itinerary
        </button>
      )}
    </div>
  );
}
