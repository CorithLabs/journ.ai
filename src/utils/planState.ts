import type { Plan } from '../db';

/**
 * Whether the intake conversation has finished.
 *
 * True only once `plan.intake` exists AND `budgetRange` is set — budget is the
 * last question answered before the "Generate Itinerary" CTA appears, so it is
 * what distinguishes a completed intake from one still mid-conversation.
 *
 * Shared because two places depend on it and must agree: ItineraryTab uses it
 * to decide between IntakeChat and GenerateItinerary, and PlanWorkspace uses it
 * to keep the AI agent hidden while intake is still running. If they disagreed,
 * the agent would appear beside the intake chat — two chat UIs at once.
 */
export function isIntakeComplete(plan: Plan | null | undefined): boolean {
  return plan?.intake != null && plan.intake.budgetRange != null;
}

/** Which screen the itinerary tab shows for a plan. */
export type ItineraryStage = 'intake' | 'generate' | 'view';

/**
 * The single source of truth for that decision.
 *
 * An existing itinerary wins over everything else. A manually-started plan has
 * days but no intake — checking intake first sent it back to the questions
 * forever, so "Build it myself" wrote the days and then bounced the user
 * straight back to the chat it was meant to escape.
 *
 * PlanWorkspace uses the same function to decide whether to show the AI agent,
 * so the agent can never appear next to IntakeChat, and is never withheld from
 * a plan the user is actually working on — including a manual one.
 */
export function itineraryStage(plan: Plan | null | undefined): ItineraryStage {
  if (plan?.itinerary?.length) return 'view';
  if (!isIntakeComplete(plan)) return 'intake';
  return 'generate';
}
