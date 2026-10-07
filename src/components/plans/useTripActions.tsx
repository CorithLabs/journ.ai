import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Download, Pencil, Trash2 } from 'lucide-react';
import type { Plan } from '../../db';
import type { ActionMenuItem } from '../ui/ActionMenu';
import Toast from '../ui/Toast';
import TripDetailsPanel from './TripDetailsPanel';
import { exportTrip, saveFile } from '../../services/tripTransfer';
import { duplicateTrip, purgeDeletedTrips, purgeTrip, restoreTrip, softDeleteTrip } from './tripStore';

/** How long a deleted trip can be brought back. */
export const UNDO_MS = 6000;

/**
 * What can be done to a trip from the trip list, and the messages that follow.
 *
 * Owned by the sidebar, which is always on screen, rather than by the menu
 * that offers the actions. The menu closes the moment an action is chosen, and
 * when it owned the "Plan deleted · Undo" message the message closed with it:
 * the trip was deleted for good five seconds later with no way back.
 */
export function useTripActions({ onOpenTrip }: { onOpenTrip?: () => void } = {}) {
  const navigate = useNavigate();
  const { planId: activePlanId } = useParams<{ planId: string }>();
  // `n` restarts the toast's timer when one message replaces another.
  const [toast, setToastState] = useState<{ message: string; undo?: () => void; n: number } | null>(null);
  const setToast = (t: { message: string; undo?: () => void }) => setToastState({ ...t, n: Date.now() });
  const [editing, setEditing] = useState<Plan | null>(null);
  // The trip waiting to be purged once its undo runs out.
  const pending = useRef<string | null>(null);

  // A trip deleted just before the app was closed is still soft-deleted.
  useEffect(() => { purgeDeletedTrips().catch(() => {}); }, []);

  const finishPending = useCallback(() => {
    const id = pending.current;
    pending.current = null;
    if (id) purgeTrip(id).catch(() => {});
  }, []);

  const dismiss = useCallback(() => {
    finishPending();
    setToastState(null);
  }, [finishPending]);

  const remove = async (plan: Plan, called: string) => {
    // A second delete finishes the first rather than stranding it.
    finishPending();
    await softDeleteTrip(plan.id);
    pending.current = plan.id;
    if (activePlanId === plan.id) navigate('/');
    setToast({
      message: `Deleted ${called}`,
      undo: async () => {
        pending.current = null;
        await restoreTrip(plan.id);
      },
    });
  };

  const duplicate = async (plan: Plan) => {
    const id = await duplicateTrip(plan.id);
    if (!id) return;
    navigate(`/plan/${id}/itinerary`);
    onOpenTrip?.();
    setToast({ message: 'Trip duplicated' });
  };

  const exportIt = async (plan: Plan) => {
    try {
      const { name, text } = await exportTrip(plan.id);
      saveFile(name, text);
      setToast({ message: 'Trip exported' });
    } catch {
      setToast({ message: 'The trip could not be exported' });
    }
  };

  /** `called` is how the list names the trip, which tells two to one place apart. */
  const itemsFor = (plan: Plan, called = plan.destination): ActionMenuItem[] => [
    { label: 'Trip details', icon: <Pencil size={15} />, onSelect: () => setEditing(plan), testId: 'trip-details' },
    { label: 'Duplicate', icon: <Copy size={15} />, onSelect: () => { void duplicate(plan); }, testId: 'trip-duplicate' },
    { label: 'Export', icon: <Download size={15} />, onSelect: () => { void exportIt(plan); }, testId: 'trip-export' },
    { label: 'Delete', ariaLabel: `Delete ${called}`, icon: <Trash2 size={15} />, onSelect: () => { void remove(plan, called); }, danger: true, testId: 'trip-delete' },
  ];

  const ui = (
    <>
      {editing && <TripDetailsPanel plan={editing} onClose={() => setEditing(null)} />}
      {toast && (
        <Toast
          key={toast.n}
          message={toast.message}
          duration={toast.undo ? UNDO_MS : 3000}
          onDismiss={dismiss}
          action={toast.undo ? { label: 'Undo', onClick: toast.undo } : undefined}
        />
      )}
    </>
  );

  return { itemsFor, ui };
}

