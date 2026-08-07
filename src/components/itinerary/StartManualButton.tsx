import { useState } from 'react';
import { PencilLine } from 'lucide-react';
import { db, type Plan } from '../../db';
import { scaffoldDays } from '../../utils/scaffoldDays';

/**
 * Escape hatch from the AI flow into building an itinerary by hand.
 *
 * Writing the scaffolded days makes `plan.itinerary` non-empty, which is what
 * ItineraryTab's state machine watches — useLiveQuery re-renders it straight
 * into ItineraryView, where activities can already be added and edited. No
 * navigation is needed and nothing here calls a provider, so the whole path
 * works with no API key.
 */
export default function StartManualButton({
  plan,
  variant = 'link',
}: {
  plan: Plan;
  variant?: 'link' | 'button';
}) {
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await db.plans.update(plan.id, {
        itinerary: scaffoldDays(plan.startDate, plan.endDate),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? 'Setting up…' : 'Build it myself';

  if (variant === 'button') {
    return (
      <button
        onClick={start}
        disabled={busy}
        className="flex items-center gap-2 border border-accent-muted text-accent hover:bg-accent/10 disabled:opacity-60 px-5 py-2.5 rounded-xl text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
        data-testid="start-manual-btn"
      >
        <PencilLine size={16} aria-hidden="true" /> {label}
      </button>
    );
  }

  return (
    <button
      onClick={start}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-accent underline disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none rounded"
      data-testid="start-manual-btn"
    >
      <PencilLine size={12} aria-hidden="true" /> {label}
    </button>
  );
}
