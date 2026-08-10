import { useEffect, useState } from 'react';
import { FileText, Paperclip, Pin, Pencil, Trash2 } from 'lucide-react';
import type { ClipboardItem } from '../../db';
import { TYPE_BORDER, formatFileSize, isImageMime } from './clipboardConstants';
import { CardActionRail, CardAction } from '../ui/CardActionRail';

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
    // A div wrapping a button, not a button: the rail's controls cannot be
    // nested inside the card's own button.
    <div
      className={`card-surface w-full flex items-stretch border-l-2 ${border} rounded-card overflow-hidden`}
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

    {/* Everything you could do to a clipboard item was a screen deep in the
        detail view — a card had no actions on it at all. */}
    {(onEdit || onPin || onDelete) && (
      <CardActionRail testId="clipboard-actions">
        {onPin && (
          <CardAction
            icon={<Pin size={16} />}
            label={isLinked ? `Unlink ${item.title} from the itinerary` : `Link ${item.title} to the itinerary`}
            onClick={onPin}
            active={isLinked}
            testId="clipboard-pin"
          />
        )}
        {onEdit && (
          <CardAction icon={<Pencil size={16} />} label={`Edit ${item.title}`} onClick={onEdit} testId="clipboard-edit" />
        )}
        {onDelete && (
          <CardAction icon={<Trash2 size={16} />} label={`Delete ${item.title}`} onClick={onDelete} tone="danger" testId="clipboard-delete" />
        )}
      </CardActionRail>
    )}
    </div>
  );
}
