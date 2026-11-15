import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ensureSampleTrip } from '../db/seed';
import { useAppStore } from '../store';
import { setOnboarded } from '../services/onboarding';

/**
 * /demo — a shareable link straight to the sample Tokyo trip.
 *
 * Opens the copy already in this browser, or adds one if it was deleted (or
 * never seeded). Someone arriving from a demo link came to see a trip, not
 * the introduction, so it is marked as seen before the shell mounts.
 */
export default function DemoPage() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOnboarded();
    ensureSampleTrip()
      .then((id) => {
        if (cancelled) return;
        useAppStore.getState().setActivePlan(id);
        setTarget(`/plan/${id}/itinerary`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Opening the sample trip failed:', err);
        if (!cancelled) setTarget('/');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (target) return <Navigate to={target} replace />;
  return (
    <div className="h-full grid place-items-center text-sm text-ink-muted" data-testid="demo-loading">
      Opening the sample trip…
    </div>
  );
}
