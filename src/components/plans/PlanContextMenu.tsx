import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Copy, Trash2 } from 'lucide-react';
import { db, type Plan } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import Toast from '../ui/Toast';
import TripDetailsPanel from './TripDetailsPanel';

interface Props {
  planId: string;
  x: number;
  y: number;
  onClose: () => void;
}

export default function PlanContextMenu({ planId, x, y, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { planId: activePlanId } = useParams<{ planId: string }>();
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [deletedPlanId, setDeletedPlanId] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  /*
   * Renaming used to be a window.prompt writing straight to `destination`,
   * which is what the map's anchors and the visa to-do are built from — so
   * renaming "Percé" to "Gaspésie road trip" quietly repointed both at a
   * place that does not geocode. Everything about a trip is editable in one
   * place now, with the destination re-resolved to a country properly.
   */
  const handleEdit = async () => {
    onClose();
    const plan = await db.plans.get(planId);
    if (plan) setEditing(plan);
  };

  const handleDuplicate = async () => {
    onClose();
    const plan = await db.plans.get(planId);
    if (!plan) return;
    const newPlan = {
      ...plan,
      id: uuidv4(),
      name: `${plan.name} (copy)`,
      destination: `${plan.destination} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.plans.add(newPlan);
    setToast('Plan duplicated');
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteClick = () => {
    setConfirmDelete(true);
  };

  const handleDeleteConfirm = async () => {
    setConfirmDelete(false);
    onClose();

    await db.plans.update(planId, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });

    if (activePlanId === planId) {
      navigate('/');
    }

    setDeletedPlanId(planId);
    setToast('Plan deleted');

    undoTimerRef.current = setTimeout(async () => {
      // Hard delete after 5s
      await db.plans.delete(planId);
      setDeletedPlanId(null);
      setToast(null);
    }, 5000);
  };

  const handleUndo = async () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (deletedPlanId) {
      await db.plans.update(deletedPlanId, {
        deleted: false,
        updatedAt: new Date().toISOString(),
      });
    }
    setDeletedPlanId(null);
    setToast(null);
  };

  // Rendered outside the menu, which closes the moment the panel opens.
  if (editing) {
    return <TripDetailsPanel plan={editing} onClose={() => setEditing(null)} />;
  }

  return (
    <>
      <div
        ref={ref}
        role="menu"
        aria-label="Plan options"
        className="fixed z-50 w-44 bg-surface-overlay border border-white/10 rounded-card shadow-glass py-1"
        style={{ left: x, top: y }}
      >
        {!confirmDelete ? (
          <>
            <button
              role="menuitem"
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-raised transition-colors"
              onClick={handleEdit}
            >
              <Pencil size={14} aria-hidden="true" />
              Trip details
            </button>
            <button
              role="menuitem"
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-raised transition-colors"
              onClick={handleDuplicate}
            >
              <Copy size={14} aria-hidden="true" />
              Duplicate
            </button>
            <hr className="border-white/5 my-1" />
            <button
              role="menuitem"
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-status-danger hover:bg-surface-raised transition-colors"
              onClick={handleDeleteClick}
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
          </>
        ) : (
          <div className="px-3 py-2">
            <p className="text-sm text-ink-primary mb-2">Delete this plan?</p>
            <div className="flex gap-2">
              <button
                className="flex-1 py-1 rounded-lg bg-status-danger text-white text-xs font-semibold"
                onClick={handleDeleteConfirm}
              >
                Delete
              </button>
              <button
                className="flex-1 py-1 rounded-lg bg-surface-raised text-ink-secondary text-xs"
                onClick={() => { setConfirmDelete(false); onClose(); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <Toast
          message={toast}
          onDismiss={() => setToast(null)}
          action={deletedPlanId ? { label: 'Undo', onClick: handleUndo } : undefined}
        />
      )}
    </>
  );
}
