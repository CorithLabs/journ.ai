import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin } from 'lucide-react';
import { db } from '../../db';
import TripDetailsPanel from '../plans/TripDetailsPanel';

/**
 * Which plan you are looking at.
 *
 * The sidebar carries this on desktop, but on a phone it lives behind a drawer
 * — so once the drawer closes there is nothing on screen naming the plan being
 * edited. This sits in the nav bar alongside the tabs.
 *
 * It used to name the active tab as well. The tabs are in this same bar at
 * every width, a few pixels away, with the current one already highlighted —
 * so the second half of the breadcrumb said what the tablist was saying, and
 * spent the room the plan name needs to do it.
 *
 * The name opens the trip's own settings. Everything the new-plan form asked
 * — dates, travel, the route — was otherwise reachable only through a
 * right-click menu in a sidebar that is behind a drawer on a phone, which is
 * no way to find the answers you gave ten minutes ago.
 */
export default function PlanBreadcrumb({ planId }: { planId: string }) {
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  const [editing, setEditing] = useState(false);

  if (!plan) return null;

  return (
    <>
      <nav
        className="flex items-center gap-1.5 min-w-0 text-ink-secondary"
        aria-label="Breadcrumb"
        data-testid="plan-breadcrumb"
      >
        <MapPin size={14} className="text-accent shrink-0" aria-hidden="true" />
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-medium text-ink-primary truncate hover:text-accent transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none rounded"
          title={`${plan.destination} — trip details`}
          aria-label={`${plan.destination} — open trip details`}
          data-testid="breadcrumb-plan-btn"
        >
          {plan.destination}
        </button>
      </nav>

      {editing && <TripDetailsPanel plan={plan} onClose={() => setEditing(false)} />}
    </>
  );
}
