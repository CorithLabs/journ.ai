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
