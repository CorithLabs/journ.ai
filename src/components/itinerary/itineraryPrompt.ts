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
import { describeLeg, tripRoute, travelModeLabel } from '../../utils/travel';

/** Human-readable budget-tier labels, shared with the component's budget badge. */
export const BUDGET_RANGES: Record<string, string> = {
  budget: 'budget (< $100/person/day)',
  mid: 'mid ($100–$300/person/day)',
  premium: 'premium ($300–$600/person/day)',
  luxury: 'luxury ($600+/person/day)',
};

/**
 * The lines describing how the trip is actually travelled.
 *
 * Only what the user has said: an absent arrival time should leave the model
 * planning a normal first day, not defending against a guess.
 */
function tripLines(plan: Plan): string[] {
  const lines: string[] = [];

  const route = tripRoute(plan);
  if (route.length > 1) {
    const nights = new Map(
      (plan.stops ?? [])
        .filter((s) => s.nights)
        .map((s) => [s.city.split(',')[0].trim().toLowerCase(), s.nights as number]),
    );
    const labelled = route.map((city) => {
      const n = nights.get(city.split(',')[0].trim().toLowerCase());
      return n ? `${city} (${n} night${n === 1 ? '' : 's'})` : city;
    });
    lines.push(`- Route, in this order: ${labelled.join(' → ')}`);
    lines.push(
      `- The trip starts in ${route[0]} and ends in ${route[route.length - 1]}. Do not reorder it.`,
    );
  }

  const arrival = describeLeg(plan.arrival, plan.destination);
  if (arrival) lines.push(`- Arrival: ${arrival}`);
  const departure = describeLeg(plan.departure, plan.destination);
  if (departure) lines.push(`- Departure: ${departure}`);

  // Worth stating plainly: a road trip can stop anywhere, which a
  // flight-shaped itinerary never suggests.
  if (plan.arrival?.mode === 'car') {
    lines.push('- Travelling by car, so stops along the route are possible.');
  } else if (plan.arrival?.mode) {
    lines.push(`- Travelling by ${travelModeLabel(plan.arrival.mode).toLowerCase()}.`);
  }

  return lines;
}

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
    ...tripLines(plan),
    `- Travellers: ${intake?.numTravellers ?? 1}`,
    `- Kids: ${intake?.kids ? 'yes, ages: ' + (intake.kidAges?.join(', ') ?? 'unknown (generate general family-friendly, age-appropriate activities)') : 'no'}`,
    `- Likes: ${intake?.likes?.join(', ') || 'general sightseeing'}`,
    `- Dislikes: ${intake?.dislikes?.join(', ') || 'none'}`,
    `- Budget: ${budgetLabel}`,
    '',
    'Content rules:',
    // The first and last days are the ones a generic itinerary always gets
    // wrong: a full programme on a day the traveller lands at 22:40, and a
    // museum on a morning they are already at the station.
    '- Respect the arrival and departure above. Leave the first day light if the',
    '  traveller arrives late, and the last day light if they leave early; plan',
    '  nothing before an arrival or after a departure.',
    '- If more cities are listed, visit them in the order given and spend roughly',
    '  the stated nights in each. Put travel between cities in the itinerary as an',
    '  activity of its own.',
    '- Keep activities within the stated budget tier. Set "budgetWarning": true on any',
    '  activity that may borderline or exceed the budget (err on the side of warning).',
    '- If kids are present, every activity must be age-appropriate.',
    '- Give one "estimatedDailySpend" {min,max,currency:"USD"} per day using realistic estimates.',
    '- "time" is 24h "HH:MM". Generate a fresh UUID-like string for each activity "id".',
    // Every locationName is fed to a geocoder, and a vague one comes back as
    // the middle of the city or as nothing at all — which is how activities
    // went missing from the map.
    '- "locationName" must be a real, searchable place with its city, e.g.',
    '  "Senso-ji Temple, Asakusa, Tokyo". Never "downtown", "various", "TBD" or',
    '  the name of the activity. If an activity has no single place (a travel day,',
    '  free time), name the station, terminal or neighbourhood it happens at.',
    '',
    'Schema (return exactly this shape):',
    '{"days":[{"dayIndex":0,"label":"Day 1","estimatedDailySpend":{"min":80,"max":150,"currency":"USD"},"activities":[{"id":"a1","name":"...","time":"09:00","locationName":"...","notes":"...","budgetWarning":false}]}]}',
    '',
    'Return the JSON object now, starting with {.',
  ].join('\n');
}
