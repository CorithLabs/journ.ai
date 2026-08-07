import { useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { type Plan, type Day, db } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import { autoGenerateTodos } from './generateTodos';
import { streamCompletion, MissingKeyError } from '../../services/aiClient';
import { buildItineraryPrompt, BUDGET_RANGES } from './itineraryPrompt';
import StartManualButton from './StartManualButton';
import {
  exceedsMaxTripDays,
  tripDayCount,
  tooLongForGenerationMessage,
} from '../../utils/tripDuration';

interface Props {
  plan: Plan;
  onGenerated: () => void;
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

/** Find the days array across the shapes models actually return: {days:[…]},
 *  {itinerary:[…]}, {itinerary:{days:[…]}}, or a bare […] top-level array. */
function extractDaysArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.days)) return o.days;
  if (Array.isArray(o.itinerary)) return o.itinerary;
  const it = o.itinerary as Record<string, unknown> | undefined;
  if (it && Array.isArray(it.days)) return it.days;
  return null;
}

function validateAndParseDays(raw: unknown): Day[] | null {
  const daysRaw = extractDaysArray(raw);
  if (!daysRaw || daysRaw.length === 0) return null;
  return daysRaw.map((d: unknown, i: number) => {
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
 * 0. Strip any surrounding markdown code fences (```json ... ```) — models
 *    frequently wrap their JSON response in fences despite the "no markdown"
 *    instruction, and the repair prompt's response is often fenced too.
 * 1. Extract the first JSON object.
 * 2. Parse directly.
 * 3. On failure, apply a local trailing-comma repair and retry.
 * Returns null if the text cannot be coerced into a valid itinerary.
 */
function tryParseItinerary(text: string): Day[] | null {
  // Strip ALL code-fence markers anywhere (```json / ```), not just anchored ones —
  // models wrap JSON in fences and sometimes add prose around it.
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  // Candidate JSON slices, widest first: the outermost object, the outermost
  // array (model may return a bare [...] of days), then the whole cleaned text.
  const candidates: string[] = [];
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) candidates.push(obj[0]);
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) candidates.push(arr[0]);
  candidates.push(cleaned);
  for (const cand of candidates) {
    // Try as-is, then with a trailing-comma repair (a common model slip).
    for (const attempt of [cand, cand.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')]) {
      try {
        const days = validateAndParseDays(JSON.parse(attempt));
        if (days) return days;
      } catch {
        /* try the next candidate/repair */
      }
    }
  }
  return null;
}

export default function GenerateItinerary({ plan, onGenerated }: Props) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  // The raw AI text kept when parsing fails — surfaced in a details expander so a
  // parse failure is diagnosable instead of a dead-end "couldn't read".
  const [rawResponse, setRawResponse] = useState<string | null>(null);

  // NewPlanModal caps new plans at MAX_TRIP_DAYS, but a plan created before that
  // cap shipped — or duplicated from one — can still be over. Generating from it
  // would blow the token budget and fail mid-JSON, so block it up front with a
  // message that says what to do instead of burning a request first.
  const tooLong = exceedsMaxTripDays(plan.startDate, plan.endDate);
  const tooLongMessage = tooLongForGenerationMessage(
    tripDayCount(plan.startDate, plan.endDate),
  );

  const generate = async () => {
    // Defence in depth: the button is not rendered when tooLong, but Retry and
    // any future caller route through here too.
    if (tooLong) {
      setError(tooLongMessage);
      setStatus('error');
      return;
    }
    setStatus('generating'); setError(null); setStreamText(''); setRawResponse(null);
    try {
      const prompt = buildItineraryPrompt(plan);
      const fullText = await streamCompletion(
        [{ role: 'user', content: prompt }],
        { onToken: setStreamText },
      );

      // First attempt: extract + local repair.
      let days = tryParseItinerary(fullText);
      let lastRaw = fullText;

      // Second attempt: ask the AI to repair its own malformed output with a
      // follow-up prompt before giving up.
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
        lastRaw = repaired;
        days = tryParseItinerary(repaired);
      }

      // Still malformed → keep the raw text for diagnosis and keep the previous
      // itinerary intact (no write has happened, so nothing is lost).
      if (!days) {
        setRawResponse(lastRaw);
        // A complete itinerary ends with a closing } or ]. If it doesn't, the
        // model almost certainly hit its output-token cap mid-JSON.
        const tail = lastRaw.replace(/```/g, '').trim();
        const looksTruncated = tail.length > 0 && !/[}\]]$/.test(tail);
        throw new Error(
          looksTruncated
            ? 'The itinerary was cut off before it finished — the trip is likely too long for one response. Try fewer days, then retry.'
            : 'The AI returned an itinerary we could not read. Your previous plan is unchanged — please retry.',
        );
      }

      await db.plans.update(plan.id, { itinerary: days, updatedAt: new Date().toISOString() });
      // Re-fetch the freshly-written plan so autoGenerateTodos sees the new
      // itinerary — the `plan` prop is stale (still itinerary: []) until
      // useLiveQuery propagates the IndexedDB write back through React.
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
          <div className="min-w-0">
            <p className="text-sm text-status-danger">{error}</p>
            <button className="text-xs text-accent hover:underline mt-1" onClick={generate}>Retry</button>
            {rawResponse && (
              <details className="mt-2">
                <summary className="text-xs text-ink-muted cursor-pointer hover:text-ink-secondary">Show what the AI returned</summary>
                <pre className="mt-1 bg-surface-overlay rounded-lg p-2 text-[11px] text-ink-muted font-mono max-h-40 overflow-auto whitespace-pre-wrap break-words">{rawResponse.slice(-2000)}</pre>
              </details>
            )}
          </div>
        </div>
      )}
      {tooLong ? (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 bg-status-warning/10 border border-status-warning/20 rounded-xl max-w-sm text-left"
          data-testid="trip-too-long-warning"
        >
          <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-status-warning">{tooLongMessage}</p>
        </div>
      ) : (
        status !== 'generating' && (
          <div className="flex flex-col items-center gap-3">
            <button onClick={generate} className="flex items-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-6 py-2.5 rounded-xl transition-colors" data-testid="start-generate-btn">
              <Sparkles size={16} aria-hidden="true" /> Generate Itinerary
            </button>
            {/* Also the way out when generation keeps failing — the day
                skeletons are written locally and need no provider. */}
            <StartManualButton plan={plan} />
          </div>
        )
      )}
    </div>
  );
}
