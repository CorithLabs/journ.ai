import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import IntakeChat from '../itinerary/IntakeChat';
import GenerateItinerary from '../itinerary/GenerateItinerary';
import ItineraryView from '../itinerary/ItineraryView';

interface Props {
  planId: string;
}

/**
 * ItineraryTab — three-state routing machine.
 *
 * The tab reads the plan reactively from IndexedDB via `useLiveQuery`, so any
 * write to the plan record (intake saved, itinerary generated) re-renders this
 * component and transitions it to the next state automatically — no manual
 * navigation is required anywhere.
 *
 *   1. !hasIntake                      → <IntakeChat>       (gather preferences)
 *   2. hasIntake && itinerary empty    → <GenerateItinerary> (kick off AI generation)
 *   3. itinerary.length > 0            → <ItineraryView>    (review / edit the plan)
 *
 * `hasIntake` is true only once the intake conversation is COMPLETE — i.e.
 * `plan.intake` exists AND `plan.intake.budgetRange` has been set (budget is the
 * last collected field before the "Generate Itinerary →" CTA appears). Checking
 * `budgetRange` for null/undefined is what distinguishes a completed intake from
 * one that is still mid-conversation.
 */
export default function ItineraryTab({ planId }: Props) {
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);

  if (!plan) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div
          className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"
          aria-label="Loading"
        />
      </div>
    );
  }

  // Intake is complete only when it exists AND budgetRange (the final question)
  // has been answered. `!= null` matches both null and undefined.
  const hasIntake = plan.intake != null && plan.intake.budgetRange != null;
  const hasItinerary = Array.isArray(plan.itinerary) && plan.itinerary.length > 0;

  // State 1 — no completed intake yet: gather preferences.
  if (!hasIntake) {
    return <IntakeChat plan={plan} />;
  }

  // State 2 — intake done but no itinerary: offer AI generation.
  // onGenerated is intentionally a no-op: GenerateItinerary writes the itinerary
  // to IndexedDB, which makes useLiveQuery re-render into State 3 on its own.
  if (!hasItinerary) {
    return <GenerateItinerary plan={plan} onGenerated={() => {}} />;
  }

  // State 3 — itinerary exists: review and edit.
  return <ItineraryView plan={plan} />;
}
