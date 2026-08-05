import { useNavigate } from 'react-router-dom';
import { Paperclip } from 'lucide-react';
import type { ClipboardItem } from '../../db';

interface Props {
  planId: string;
  /** All clipboard items linked to this activity or whole day. */
  items: ClipboardItem[];
  /**
   * When true, the linked source activity has been removed from the itinerary —
   * the badge shows "(source removed)" and offers an unlink action.
   */
  sourceRemoved?: boolean;
  onUnlink?: (itemId: string) => void;
}

/**
 * Renders attachment badges for clipboard items linked to an itinerary
 * activity or day. Clicking a badge opens the clipboard item detail view.
 */
export default function AttachmentBadges({ planId, items, sourceRemoved, onUnlink }: Props) {
  const navigate = useNavigate();
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1 pl-6" data-testid="attachment-badges">
      {items.map((item) => (
        <span key={item.id} className="inline-flex items-center gap-1">
          <button
            onClick={() => navigate(`/plan/${planId}/clipboard/${item.id}`)}
            className="inline-flex items-center gap-1 text-xs text-ink-secondary bg-surface-overlay border border-white/10 rounded-full px-2 py-0.5 hover:text-ink-primary hover:border-accent-muted transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            data-testid="attachment-badge"
            aria-label={`Open clipboard item: ${item.title}`}
          >
            <Paperclip size={11} aria-hidden="true" />
            <span className="max-w-[10rem] truncate">
              {sourceRemoved ? 'Attachment (source removed)' : item.title}
            </span>
          </button>
          {sourceRemoved && onUnlink && (
            <button
              onClick={() => onUnlink(item.id)}
              className="text-xs text-ink-muted hover:text-status-danger"
              data-testid="badge-unlink-btn"
              aria-label={`Unlink ${item.title}`}
            >
              Unlink
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
