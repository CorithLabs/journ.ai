import { type ReactNode } from 'react';
import { Pencil, Trash2, MapPin, ArrowUpRight } from 'lucide-react';
import Modal from './Modal';

/**
 * The one place a card says everything it knows.
 *
 * A card in a list has to stay a card: notes clamp to three lines, an address
 * sits under a location that already wraps, and anything longer is simply not
 * there. That is the right trade for a list you scan — but it left details
 * written down and then unreachable, since the only way back to them was to
 * open the editor and read the form.
 *
 * The actions live here rather than only on the card's edge rail, because a
 * detail view that can be read but not acted on sends you back to the list to
 * do the thing you just decided to do.
 */
export default function DetailModal({
  title,
  onClose,
  children,
  onEdit,
  onDelete,
  deleteLabel = 'Delete',
  /** An outward link — a venue on a map. Opens in a new tab. */
  mapUrl,
  mapLabel = 'Map',
  /** A move inside the app — the itinerary day a task came from. */
  goTo,
  testId = 'detail-modal',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  mapUrl?: string | null;
  mapLabel?: string;
  goTo?: { label: string; onClick: () => void } | null;
  testId?: string;
}) {
  const action =
    'flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none';

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4" data-testid={testId}>
        {children}

        {/* Delete is set apart from the two that do not destroy anything, so
            the finger heading for Edit is not next to it. */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onEdit}
            className={`${action} border-white/10 text-ink-primary hover:bg-white/5`}
            data-testid="detail-edit"
          >
            <Pencil size={14} aria-hidden="true" /> Edit
          </button>

          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${action} border-white/10 text-ink-primary hover:bg-white/5`}
              data-testid="detail-map"
            >
              <MapPin size={14} aria-hidden="true" /> {mapLabel}
            </a>
          )}

          {goTo && (
            <button
              type="button"
              onClick={goTo.onClick}
              className={`${action} border-white/10 text-ink-primary hover:bg-white/5`}
              data-testid="detail-goto"
            >
              <ArrowUpRight size={14} aria-hidden="true" /> {goTo.label}
            </button>
          )}

          <button
            type="button"
            onClick={onDelete}
            className={`${action} shrink-0 grow-0 border-status-danger/40 text-status-danger hover:bg-status-danger/10`}
            aria-label={deleteLabel}
            data-testid="detail-delete"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * One fact, with the name of the fact beside it.
 *
 * Detail views drift into unlabelled lines of text that only make sense to
 * whoever wrote the layout — a bare date, a bare category. The label is what
 * makes a detail view readable rather than merely complete.
 */
export function DetailRow({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-white/5 last:border-b-0" data-testid={testId}>
      <dt className="w-24 shrink-0 text-xs text-ink-muted pt-0.5">{label}</dt>
      <dd className="flex-1 min-w-0 text-sm text-ink-primary break-words whitespace-pre-wrap">
        {children}
      </dd>
    </div>
  );
}
