/**
 * Itinerary generation prompt — kept in its own file so it's easy to tune
 * without touching the component or parsing logic.
 *
 * `buildItineraryPrompt` returns the single user message sent to the AI. The
 * response is expected to be ONE JSON object matching the schema below; the
 * parser (GenerateItinerary.tsx `tryParseItinerary`) is tolerant of fences and
 * common slips, but the cleaner the model's output, the more reliably it parses.
 *
 * To change the itinerary style, edit the OUTPUT CONTRACT / Content rules /
 * Schema strings below. Keep the schema in sync with `validateAndParseDays`.
 */
import type { Plan } from '../../db';

/** Human-readable budget-tier labels, shared with the component's budget badge. */
export const BUDGET_RANGES: Record<string, string> = {
  budget: 'budget (< $100/person/day)',
  mid: 'mid ($100–$300/person/day)',
  premium: 'premium ($300–$600/person/day)',
  luxury: 'luxury ($600+/person/day)',
};

export function buildItineraryPrompt(plan: Plan): string {
  const intake = plan.intake;
  const budgetLabel = intake?.budgetRange
    ? BUDGET_RANGES[intake.budgetRange]
    : 'mid ($100–$300/person/day)';

  return [
    'You are a travel planner that outputs ONLY machine-readable JSON.',
    '',
    'OUTPUT CONTRACT (follow exactly):',
    '- Respond with a single JSON object and NOTHING else.',
    '- Your first character MUST be "{" and your last character MUST be "}".',
    '- No markdown, no code fences (```), no commentary before or after.',
    '- Use double quotes for all keys and string values. No trailing commas.',
    '- Keep it COMPLETE and COMPACT so it fits in one response: 3–6 activities per day,',
    '  and keep each "notes" to one short sentence (max ~15 words).',
    '',
    'Trip details:',
    `- Destination: ${plan.destination}`,
    `- Dates: ${plan.startDate} to ${plan.endDate}`,
    `- Travellers: ${intake?.numTravellers ?? 1}`,
    `- Kids: ${intake?.kids ? 'yes, ages: ' + (intake.kidAges?.join(', ') ?? 'unknown (generate general family-friendly, age-appropriate activities)') : 'no'}`,
    `- Likes: ${intake?.likes?.join(', ') || 'general sightseeing'}`,
    `- Dislikes: ${intake?.dislikes?.join(', ') || 'none'}`,
    `- Budget: ${budgetLabel}`,
    '',
    'Content rules:',
    '- Keep activities within the stated budget tier. Set "budgetWarning": true on any',
    '  activity that may borderline or exceed the budget (err on the side of warning).',
    '- If kids are present, every activity must be age-appropriate.',
    '- Give one "estimatedDailySpend" {min,max,currency:"USD"} per day using realistic estimates.',
    '- "time" is 24h "HH:MM". Generate a fresh UUID-like string for each activity "id".',
    '',
    'Schema (return exactly this shape):',
    '{"days":[{"dayIndex":0,"label":"Day 1","estimatedDailySpend":{"min":80,"max":150,"currency":"USD"},"activities":[{"id":"a1","name":"...","time":"09:00","locationName":"...","notes":"...","budgetWarning":false}]}]}',
    '',
    'Return the JSON object now, starting with {.',
  ].join('\n');
}
