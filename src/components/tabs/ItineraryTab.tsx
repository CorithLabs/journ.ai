import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import IntakeChat from '../itinerary/IntakeChat';
import ItineraryView from '../itinerary/ItineraryView';

interface Props {
  planId: string;
}

export default function ItineraryTab({ planId }: Props) {
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);

  if (!plan) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  // Show intake chat if no itinerary yet
  const hasItinerary = plan.itinerary && plan.itinerary.length > 0;
  const hasIntake =
    plan.intake?.numTravellers !== undefined &&
    plan.intake?.budgetRange !== undefined;

  if (!hasItinerary && !hasIntake) {
    return <IntakeChat plan={plan} />;
  }

  if (!hasItinerary) {
    return <IntakeChat plan={plan} />;
  }

  return <ItineraryView plan={plan} />;
}
