import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin, ChevronDown } from 'lucide-react';
import { db } from '../../db';
import TripDetailsPanel from '../plans/TripDetailsPanel';

/**
 * Which plan you are looking at, and the way into its settings.
 *
 * The sidebar carries the name on desktop, but on a phone it lives behind a
 * drawer — so once the drawer closes there is nothing on screen naming the
 * plan being edited. This sits in the nav bar alongside the tabs.
 *
 * It used to name the active tab as well. The tabs are in this same bar at
 * every width, a few pixels away, with the current one already highlighted —
 * so the second half of the breadcrumb said what the tablist was saying, and
 * spent the room the plan name needs to do it.
 *
 * Drawn as a pill because it is a control, not a label. Styled as plain text
 * with a hover colour it read as neither: nothing said it could be pressed,
 * and on a phone there is no hover to discover it with. The pill is the shape
 * the tabs beside it already use, and the chevron says it opens something —
 * so it borrows a vocabulary the bar has rather than inventing one.
 */
export default function PlanBreadcrumb({ planId }: { planId: string }) {
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  const [editing, setEditing] = useState(false);

  if (!plan) return null;

  return (
    <>
      <nav
        className="flex items-center min-w-0 text-ink-secondary"
        aria-label="Breadcrumb"
        data-testid="plan-breadcrumb"
      >
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 min-w-0 max-w-full px-2.5 py-1.5 rounded-full border border-white/10 bg-surface-overlay/60 hover:bg-surface-raised hover:border-accent/40 transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          title={`${plan.destination} — trip details`}
          aria-label={`${plan.destination} — open trip details`}
          aria-haspopup="dialog"
          aria-expanded={editing}
          data-testid="breadcrumb-plan-btn"
        >
          <MapPin size={13} className="text-accent shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-ink-primary truncate">{plan.destination}</span>
          <ChevronDown size={13} className="shrink-0 text-ink-muted" aria-hidden="true" />
        </button>
      </nav>

      {editing && <TripDetailsPanel plan={plan} onClose={() => setEditing(false)} />}
    </>
  );
}
