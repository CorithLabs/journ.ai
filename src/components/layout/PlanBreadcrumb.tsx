import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, MapPin } from 'lucide-react';
import { db } from '../../db';
import { useAppStore, type ActiveTab } from '../../store';

const TAB_LABELS: Record<ActiveTab, string> = {
  itinerary: 'Itinerary',
  todo: 'To-Do',
  map: 'Map',
  clipboard: 'Clipboard',
};

/**
 * Where you are: plan, then tab.
 *
 * The sidebar carries this on desktop, but on a phone it lives behind a drawer
 * — so once the drawer closes there is nothing on screen naming the plan being
 * edited. This sits in the nav bar alongside the menu trigger.
 *
 * The tab segment is hidden on the narrowest screens: the bottom bar already
 * shows the active tab, so repeating it costs room the plan name needs.
 */
export default function PlanBreadcrumb({ planId }: { planId: string }) {
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  const activeTab = useAppStore((s) => s.activeTab);

  if (!plan) return null;

  return (
    <nav
      className="flex items-center gap-1.5 min-w-0 text-ink-secondary"
      aria-label="Breadcrumb"
      data-testid="plan-breadcrumb"
    >
      <MapPin size={14} className="text-accent shrink-0" aria-hidden="true" />
      <span className="text-sm font-medium text-ink-primary truncate" title={plan.destination}>
        {plan.destination}
      </span>
      <ChevronRight size={14} className="shrink-0 hidden sm:block" aria-hidden="true" />
      <span className="text-xs shrink-0 hidden sm:block">{TAB_LABELS[activeTab]}</span>
    </nav>
  );
}
