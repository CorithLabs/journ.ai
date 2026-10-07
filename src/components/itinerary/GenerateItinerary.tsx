import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { hasAnyAiKey, NO_AI_KEY_MESSAGE } from '../../services/aiKeyStatus';
import { extractJson } from '../../utils/jsonRepair';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { type Plan, type Day, db } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import { autoGenerateTodos } from './generateTodos';
import { streamCompletion, MissingKeyError, getActiveProvider } from '../../services/aiClient';
import GeneratingTrip from './GeneratingTrip';
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
  /**
   * Return to the itinerary untouched. Only passed when there is one to go
   * back to — without it, a plan built by hand could be regenerated into a
   * screen with no exit.
   */
  onCancel?: () => void;
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
 * 1. Take the first balanced JSON value, repairing a misplaced closer or an
 *    output that stopped mid-structure.
 * 2. Fall back to the older regex slices, then the raw text.
 * 3. Try each with a trailing-comma repair too.
 * Returns null if the text cannot be coerced into a valid itinerary.
 */
function tryParseItinerary(text: string): Day[] | null {
  // Strip ALL code-fence markers anywhere (```json / ```), not just anchored ones —
  // models wrap JSON in fences and sometimes add prose around it.
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const candidates: string[] = [];
  // First choice: a balanced scan. The regexes below match greedily from the
  // first brace to the last, so a model that closed a day object twice took
  // the stray character with it and nothing parsed.
  const balanced = extractJson(cleaned);
  if (balanced) candidates.push(balanced);
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

export default function GenerateItinerary({ plan, onGenerated, onCancel }: Props) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  // The raw AI text kept when parsing fails — surfaced in a details expander so a
  // parse failure is diagnosable instead of a dead-end "couldn't read".
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  // The latest text streamed, so an error mid-stream can still show it.
  const streamed = useRef('');
  const onToken = (t: string) => { streamed.current = t; setStreamText(t); };

  // NewPlanModal caps new plans at MAX_TRIP_DAYS, but a plan created before that
  // cap shipped — or duplicated from one — can still be over. Generating from it
  // would blow the token budget and fail mid-JSON, so block it up front with a
  // message that says what to do instead of burning a request first.
  // Checked up front rather than discovered by failing: without a key the
  // Generate button could only ever produce an error, and on a regenerate
  // that error was a dead end with the user's own itinerary behind it.
  const needsKey = !hasAnyAiKey();
  const isRegenerate = Boolean(onCancel);

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
    setRepairing(false); setCopied('idle'); streamed.current = '';
    try {
      const prompt = buildItineraryPrompt(plan);
      const fullText = await streamCompletion(
        [{ role: 'user', content: prompt }],
        { onToken, json: true },
      );

      // First attempt: extract + local repair.
      let days = tryParseItinerary(fullText);
      let lastRaw = fullText;

      // Second attempt: ask the AI to repair its own malformed output with a
      // follow-up prompt before giving up.
      if (!days) {
        setRepairing(true);
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
          { onToken, json: true },
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
      // Whatever the AI had written when it failed, kept for the report.
      setRawResponse((kept) => kept ?? (streamed.current || null));
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

  /*
   * Everything needed to report a failure, as one JSON block: the message,
   * the trip it was for, the provider, and what the AI sent back. Pasted into
   * an issue or a chat, it says what went wrong without a screenshot.
   */
  const errorReport = () => {
    let provider: string | undefined;
    try { provider = getActiveProvider(); } catch { provider = undefined; }
    return JSON.stringify({
      error,
      destination: plan.destination,
      dates: { start: plan.startDate, end: plan.endDate },
      provider,
      at: new Date().toISOString(),
      aiResponse: rawResponse ?? undefined,
    }, null, 2);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(errorReport());
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center" data-testid="generate-itinerary">
      <Sparkles size={40} className="text-accent mb-4" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-ink-primary mb-2">
        {isRegenerate ? 'Regenerate your itinerary' : 'Ready to generate your itinerary'}
      </h2>
      <p className="text-sm text-ink-secondary mb-6 max-w-sm">
        {isRegenerate
          ? <>Generating again replaces the days currently in this plan for <strong className="text-ink-primary">{plan.destination}</strong>. Nothing changes until you choose to.</>
          : <>The AI will create a personalised day-by-day plan for <strong className="text-ink-primary">{plan.destination}</strong> based on your preferences.</>}
      </p>

      {/* Said before the button rather than after a failed request, with the
          way to fix it and the way out both to hand. */}
      {needsKey && (
        <div
          role="status"
          className="flex items-start gap-2 mb-4 p-3 bg-status-warning/10 border border-status-warning/20 rounded-xl max-w-sm text-left"
          data-testid="generate-needs-key"
        >
          <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm text-status-warning">{NO_AI_KEY_MESSAGE}</p>
            <Link to="/settings" className="mt-1.5 inline-block text-xs text-accent hover:underline" data-testid="generate-goto-settings">
              Go to Settings →
            </Link>
          </div>
        </div>
      )}
      {plan.intake?.budgetRange && (
        <div className="mb-4 text-xs text-accent bg-accent/10 px-3 py-1.5 rounded-full">
          Budget: {BUDGET_RANGES[plan.intake.budgetRange]}
        </div>
      )}
      {status === 'generating' && (
        <GeneratingTrip text={streamText} totalDays={tripDayCount(plan.startDate, plan.endDate)} repairing={repairing} />
      )}
      {error && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-status-danger/10 border border-status-danger/20 rounded-xl max-w-sm">
          <AlertTriangle size={16} className="text-status-danger shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm text-status-danger">{error}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
              <button className="text-xs text-accent hover:underline" onClick={generate}>Retry</button>
              <button
                type="button"
                onClick={copyReport}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                data-testid="copy-error-report"
              >
                {copied === 'done'
                  ? <><Check size={12} aria-hidden="true" /> Copied</>
                  : <><Copy size={12} aria-hidden="true" /> {rawResponse ? 'Copy error and JSON' : 'Copy error details'}</>}
              </button>
            </div>
            {/* The clipboard can be refused; then the report is shown to copy by hand. */}
            {copied === 'failed' && (
              <textarea
                readOnly
                value={errorReport()}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-2 w-full h-32 bg-surface-overlay rounded-lg p-2 text-[11px] text-ink-muted font-mono"
                aria-label="Error details to copy"
                data-testid="error-report-text"
              />
            )}
            {rawResponse && (
              <details className="mt-2">
                <summary className="text-xs text-ink-muted cursor-pointer hover:text-ink-secondary">Show what the AI returned</summary>
                <pre className="mt-1 bg-surface-overlay rounded-lg p-2 text-[11px] text-ink-muted font-mono max-h-40 overflow-auto whitespace-pre-wrap break-words">{rawResponse.slice(-2000)}</pre>
              </details>
            )}
          </div>
        </div>
      )}
      {onCancel && status !== 'generating' && (
        <button
          onClick={onCancel}
          className="mt-4 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary transition-colors"
          data-testid="cancel-generate-btn"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back to my itinerary
        </button>
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
            {!needsKey && (
              <button onClick={generate} className="flex items-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-6 py-2.5 rounded-xl transition-colors" data-testid="start-generate-btn">
                <Sparkles size={16} aria-hidden="true" /> {isRegenerate ? 'Regenerate with AI' : 'Generate Itinerary'}
              </button>
            )}
            {/* Also the way out when generation keeps failing — the day
                skeletons are written locally and need no provider. */}
            <StartManualButton plan={plan} />
          </div>
        )
      )}
    </div>
  );
}
