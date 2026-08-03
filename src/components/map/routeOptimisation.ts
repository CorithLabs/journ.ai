import { type Activity } from '../../db';
import { totalRouteDistance } from './geocoding';

export interface OptimisedActivity {
  activity: Activity;
  originalIndex: number;
  suggestedIndex: number;
}

export interface OptimisationResult {
  suggestions: OptimisedActivity[];
  originalDistanceKm: number;
  optimisedDistanceKm: number;
  isAlreadyOptimal: boolean;
}

/**
 * Builds the AI prompt for route optimisation.
 */
export function buildOptimisationPrompt(activities: Activity[]): string {
  const stops = activities
    .map((a, i) => {
      const coord = a.coordinates
        ? `[${a.coordinates[0].toFixed(4)}, ${a.coordinates[1].toFixed(4)}]`
        : 'unknown';
      return `${i + 1}. ${a.name} (${a.locationName}) coords: ${coord}`;
    })
    .join('\n');

  return [
    'You are a travel route optimiser.',
    'Reorder the following stops to minimise total travel distance (shortest path connecting all stops).',
    'Return ONLY valid JSON — no markdown, no commentary.',
    'Schema: { "order": [0-based indices in optimised sequence] }',
    'Example for 3 stops: { "order": [2, 0, 1] }',
    '',
    'Stops (0-based index):',
    stops,
  ].join('\n');
}

/**
 * Parses the AI response JSON into an order array.
 */
export function parseOptimisationResponse(raw: string): number[] | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { order?: unknown };
    if (!Array.isArray(parsed.order)) return null;
    return parsed.order.map((v) => Number(v));
  } catch {
    return null;
  }
}

/**
 * Builds the OptimisationResult from the current activities and the AI-suggested order.
 */
export function buildOptimisationResult(
  activities: Activity[],
  suggestedOrder: number[],
): OptimisationResult {
  const withCoords = activities.filter((a) => a.coordinates);

  const originalCoords = withCoords
    .map((a) => a.coordinates)
    .filter(Boolean) as [number, number][];

  // Build reordered activities
  const validOrder = suggestedOrder.filter(
    (i) => i >= 0 && i < activities.length,
  );
  // If order is incomplete, append missing indices
  const missing = activities
    .map((_, i) => i)
    .filter((i) => !validOrder.includes(i));
  const fullOrder = [...validOrder, ...missing];

  const reordered = fullOrder.map((i) => activities[i]);
  const reorderedCoords = reordered
    .map((a) => a.coordinates)
    .filter(Boolean) as [number, number][];

  const originalDistanceKm = totalRouteDistance(originalCoords);
  const optimisedDistanceKm = totalRouteDistance(reorderedCoords);

  // Build per-activity suggestion list
  const suggestions: OptimisedActivity[] = fullOrder.map((origIdx, newIdx) => ({
    activity: activities[origIdx],
    originalIndex: origIdx,
    suggestedIndex: newIdx,
  }));

  // Check if the order is identical
  const isAlreadyOptimal = fullOrder.every((v, i) => v === i);

  return {
    suggestions,
    originalDistanceKm,
    optimisedDistanceKm,
    isAlreadyOptimal,
  };
}
