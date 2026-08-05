import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { DEMO_PLAN_ID, DEMO_BANNER_DISMISSED } from '../../db/seed';

interface Props {
  planId: string;
}

/**
 * Banner shown at the top of the seeded demo plan. Dismissal is persisted to
 * localStorage (`aitp_demo_banner_dismissed`) so it never reappears once
 * closed. Renders nothing for any non-demo plan or after dismissal.
 */
export default function DemoBanner({ planId }: Props) {
  const isDemoPlan = localStorage.getItem(DEMO_PLAN_ID) === planId;
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DEMO_BANNER_DISMISSED) === 'true',
  );

  if (!isDemoPlan || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DEMO_BANNER_DISMISSED, 'true');
    setDismissed(true);
  };

  return (
    <div
      role="status"
      data-testid="demo-banner"
      className="flex items-center gap-2 px-4 py-2 bg-accent/10 border-b border-accent/20 text-sm text-ink-primary"
    >
      <Sparkles size={16} className="text-accent shrink-0" aria-hidden="true" />
      <span className="flex-1">
        This is a demo plan — edit it freely or create your own.
      </span>
      <button
        onClick={handleDismiss}
        className="p-1 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-overlay transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
        aria-label="Dismiss demo banner"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
