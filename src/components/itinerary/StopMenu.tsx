import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, MapPin, MoreHorizontal, Pencil, Pin, Trash2 } from 'lucide-react';

interface Props {
  name: string;
  mapsUrl: string | null;
  pinned: boolean;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Undefined when the stop is already first or last of the day. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

/**
 * Everything you can do to a stop, behind one button.
 *
 * Each stop used to carry a column of four icons, a red bin among them, and a
 * "Move up / Move down" line under it: a dozen controls per stop, so a day
 * read as controls with some places in between. The actions are all still one
 * tap away — the button is always there, at full touch size, with no hover to
 * find it — and in the menu each says what it does in words.
 *
 * Each item keeps the accessible name the old button had.
 */
export default function StopMenu({ name, mapsUrl, pinned, onPin, onEdit, onDelete, onMoveUp, onMoveDown }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const run = (action?: () => void) => () => {
    close();
    action?.();
  };

  const item = 'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left rounded-lg text-ink-primary hover:bg-white/5 focus-visible:bg-white/10 focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div ref={wrap} className="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-11 h-11 -my-1.5 -mr-2 grid place-items-center rounded-xl text-ink-secondary hover:text-ink-primary hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
        data-testid="stop-menu-button"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={`Actions for ${name}`}
          className="absolute right-0 top-full mt-1 z-30 w-52 p-1 rounded-xl bg-surface-overlay border border-white/10 shadow-glass"
          data-testid="stop-menu"
        >
          {mapsUrl && (
            <a
              role="menuitem"
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => close(false)}
              className={item}
              aria-label={`Open ${name} in Google Maps`}
              data-testid="activity-maps"
            >
              <MapPin size={15} className="text-accent" aria-hidden="true" /> Directions
            </a>
          )}
          <button type="button" role="menuitem" className={item} onClick={run(onPin)}
            aria-label={pinned ? 'Unpin from to-do' : 'Pin to to-do'}>
            <Pin size={15} className="text-accent" aria-hidden="true" /> {pinned ? 'Unpin from to-do' : 'Pin to to-do'}
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(onEdit)} aria-label="Edit activity">
            <Pencil size={15} className="text-accent" aria-hidden="true" /> Edit
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(onMoveUp)} disabled={!onMoveUp}
            aria-label={`Move ${name} up`}>
            <ArrowUp size={15} className="text-accent" aria-hidden="true" /> Move earlier
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(onMoveDown)} disabled={!onMoveDown}
            aria-label={`Move ${name} down`}>
            <ArrowDown size={15} className="text-accent" aria-hidden="true" /> Move later
          </button>
          <div className="my-1 h-px bg-white/10" role="separator" />
          {/* Red here, in words, where the choice is made, rather than at rest on every stop. */}
          <button type="button" role="menuitem" className={`${item} text-status-danger`} onClick={run(onDelete)}
            aria-label="Delete activity">
            <Trash2 size={15} aria-hidden="true" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
