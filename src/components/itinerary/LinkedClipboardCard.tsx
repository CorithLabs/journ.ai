import { Paperclip, ExternalLink } from 'lucide-react';
import type { ClipboardItem } from '../../db';
import { slotLabel, exactTime, formatTime } from '../../utils/activityTime';
import { TYPE_BORDER } from '../clipboard/clipboardConstants';

/**
 * A clipboard item shown on the day it belongs to.
 *
 * Linking a hotel confirmation to day three recorded the link and then showed
 * it nowhere: the itinerary for that day said nothing about a check-in, and
 * the only way to find it was to remember it existed and go looking in the
 * clipboard. A booking is part of a day whether or not anyone typed it in as
 * an activity.
 *
 * Deliberately not styled as an activity. It is not one — it cannot be
 * reordered, moved between days, or pinned to a to-do, and pretending
 * otherwise would promise controls that are not there. The dashed edge and
 * the clip mark it as something the day is referring to rather than
 * containing.
 */
export default function LinkedClipboardCard({
  item,
  onOpen,
  /**
   * Tied to the card above it, rather than standing on its own in the day.
   *
   * Drawn as one piece with it: no gap, no top corners, and indented so the
   * card's own edge continues through. A confirmation and the plan it belongs
   * to are one thing, and looking like two invited them to be read apart.
   */
  attached = false,
}: {
  item: ClipboardItem;
  onOpen: () => void;
  attached?: boolean;
}) {
  const border = TYPE_BORDER[item.type] ?? 'border-l-category-slate';
  const clock = exactTime(item.time);

  const shape = attached
    ? `-mt-px ml-3 rounded-t-none rounded-b-card border-t-0`
    : 'rounded-card';

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left flex items-center gap-2 border-l-2 ${border} border-y border-r border-dashed border-white/10 ${shape} px-3 py-2 bg-surface-base/40 hover:bg-surface-raised/60 transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none`}
      data-testid={attached ? 'attached-clipboard-card' : 'linked-clipboard-card'}
      aria-label={
        attached
          ? `${item.type}: ${item.title} — attached to this activity, open in clipboard`
          : `${item.type}: ${item.title} — open in clipboard`
      }
    >
      <Paperclip size={13} className="shrink-0 text-ink-muted" aria-hidden="true" />

      {item.time && (
        <span className="shrink-0 text-[11px] font-semibold text-ink-secondary bg-white/5 px-2 py-0.5 rounded-full">
          {slotLabel(item.time)}
        </span>
      )}
      {/* The exact time survives beside the slot, the way it does on an
          activity: "Noon" is where it sits, but 3pm is the thing you cannot
          miss. */}
      {clock && (
        <span className="shrink-0 text-[11px] text-ink-muted tabular-nums">{formatTime(item.time!)}</span>
      )}

      <span className="min-w-0 flex-1 text-sm text-ink-primary truncate">{item.title}</span>
      <span className="shrink-0 text-[11px] text-ink-muted">{item.type}</span>
      <ExternalLink size={12} className="shrink-0 text-ink-muted" aria-hidden="true" />
    </button>
  );
}
