import { useEffect, useState } from 'react';
import { FileText, Paperclip, Pin, Pencil, Trash2 } from 'lucide-react';
import type { ClipboardItem } from '../../db';
import { TYPE_BORDER, formatFileSize, isImageMime } from './clipboardConstants';
import ActionMenu from '../ui/ActionMenu';

interface Props {
  item: ClipboardItem;
  onClick?: () => void;
  onEdit?: () => void;
  /** Link to a day or activity, or unlink when already linked. */
  onPin?: () => void;
  onDelete?: () => void;
}

/**
 * A single clipboard item card. Colour-coded left border per type.
 * Shows an image thumbnail for image blobs, a PDF/document icon otherwise,
 * plus the filename and human-readable file size for file items.
 */
export default function ClipboardCard({ item, onClick, onEdit, onPin, onDelete }: Props) {
  const border = TYPE_BORDER[item.type] ?? 'border-l-category-slate';
  const mime = item.fileBlob?.type;
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // Build an object URL for image blobs; revoke on unmount / change.
  useEffect(() => {
    if (item.fileBlob && isImageMime(mime)) {
      const url = URL.createObjectURL(item.fileBlob);
      setThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setThumbUrl(null);
    return undefined;
  }, [item.fileBlob, mime]);

  const hasFile = !!item.fileName;

  const isLinked = item.linkedDayIndex !== undefined;

  return (
    // A div wrapping a button, not a button: its menu cannot be
    // nested inside the card's own button.
    <div
      // Not overflow-hidden, which would clip the actions menu; lifted over the
      // cards below while it is open.
      className={`card-surface relative has-[[aria-expanded=true]]:z-20 w-full flex items-stretch border-l-2 ${border} rounded-card`}
      data-testid="clipboard-card"
    >
    <button
      onClick={onClick}
      className="flex-1 min-w-0 text-left flex gap-3 items-start p-3 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
      aria-label={`${item.type}: ${item.title}`}
    >
      {hasFile && (
        <div className="shrink-0">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={`Preview of ${item.fileName}`}
              className="w-12 h-12 rounded-lg object-cover"
              data-testid="card-thumb"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-surface-overlay flex items-center justify-center">
              <FileText size={22} className="text-accent" aria-hidden="true" />
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full shrink-0">
            {item.type}
          </span>
          <span className="text-base font-medium text-ink-primary truncate">{item.title}</span>
        </div>
        {isLinked && (
          <p className="mt-1 text-xs font-semibold text-accent-light" data-testid="clipboard-linked-flag">
            Linked to Day {item.linkedDayIndex! + 1}
          </p>
        )}
        {item.body && (
          <p className="mt-1 text-sm text-ink-secondary line-clamp-2 whitespace-pre-wrap">
            {item.body}
          </p>
        )}
        {hasFile && (
          <p
            className="mt-1 flex items-center gap-1 text-xs text-ink-muted"
            data-testid="card-file-meta"
          >
            <Paperclip size={12} aria-hidden="true" />
            <span className="truncate">{item.fileName}</span>
            {item.fileSize !== undefined && <span>· {formatFileSize(item.fileSize)}</span>}
          </p>
        )}
      </div>
    </button>

    {/* Its actions, behind one button. They used to be a rail of three icons
        with a red bin on every card; before that, a screen deep in the detail
        view. */}
    {(onEdit || onPin || onDelete) && (
      <div className="shrink-0 self-start pt-1 pr-1" data-testid="clipboard-actions">
        <ActionMenu
          label={`More actions for ${item.title}`}
          menuLabel={`Actions for ${item.title}`}
          items={[
            ...(onPin ? [{
              label: isLinked ? 'Unlink from itinerary' : 'Link to itinerary',
              ariaLabel: isLinked ? `Unlink ${item.title} from the itinerary` : `Link ${item.title} to the itinerary`,
              icon: <Pin size={15} />, onSelect: onPin, testId: 'clipboard-pin',
            }] : []),
            ...(onEdit ? [{ label: 'Edit', ariaLabel: `Edit ${item.title}`, icon: <Pencil size={15} />, onSelect: onEdit, testId: 'clipboard-edit' }] : []),
            ...(onDelete ? [{ label: 'Delete', ariaLabel: `Delete ${item.title}`, icon: <Trash2 size={15} />, onSelect: onDelete, danger: true, testId: 'clipboard-delete' }] : []),
          ]}
        />
      </div>
    )}
    </div>
  );
}
