import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import IntakeChat from '../itinerary/IntakeChat';
import GenerateItinerary from '../itinerary/GenerateItinerary';
import ItineraryView from '../itinerary/ItineraryView';
import { itineraryStage } from '../../utils/planState';

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

  // Shared with PlanWorkspace so the two can't disagree about which screen the
  // user is on. An existing itinerary wins, which is what makes a manually
  // started plan (days, but no intake) land here rather than back in intake.
  switch (itineraryStage(plan)) {
    case 'view':
      return <ItineraryView plan={plan} />;
    case 'intake':
      return <IntakeChat plan={plan} />;
    // onGenerated is intentionally a no-op: GenerateItinerary writes the
    // itinerary to IndexedDB, and useLiveQuery re-renders into 'view' on its own.
    default:
      return <GenerateItinerary plan={plan} onGenerated={() => {}} />;
  }
}
