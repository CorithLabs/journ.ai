import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  /** What the item says. */
  label: string;
  /** The accessible name, when it should say more than the label ("Delete: Book the ferry"). */
  ariaLabel?: string;
  icon?: ReactNode;
  onSelect?: () => void;
  /** A link instead of an action: opens in a new tab. */
  href?: string;
  disabled?: boolean;
  /** Destructive: red, and set apart below a divider. */
  danger?: boolean;
  testId?: string;
}

interface Props {
  /** The button's accessible name, e.g. "More actions for Meiji Shrine". */
  label: string;
  /** The menu's accessible name, e.g. "Actions for Meiji Shrine". */
  menuLabel: string;
  items: ActionMenuItem[];
  buttonTestId?: string;
  menuTestId?: string;
}

/**
 * Everything you can do to one thing in a list, behind one button.
 *
 * Rows used to carry a column of icons each, a red bin among them, so a list
 * read as controls with content in between. The actions are all still one tap
 * away — the button is always there, at full touch size, with no hover to
 * find it — and the menu says each in words. Delete is red here, where the
 * choice is made, and nowhere at rest.
 */
export default function ActionMenu({ label, menuLabel, items, buttonTestId, menuTestId }: Props) {
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
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const at = els.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % els.length : (at - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  const cls = (danger?: boolean) =>
    `w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left rounded-lg hover:bg-white/5 focus-visible:bg-white/10 focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent ${
      danger ? 'text-status-danger' : 'text-ink-primary'
    }`;

  const safe = items.filter((i) => !i.danger);
  const risky = items.filter((i) => i.danger);

  const render = (i: ActionMenuItem) => {
    const icon = i.icon && <span className={i.danger ? '' : 'text-accent'} aria-hidden="true">{i.icon}</span>;
    if (i.href) {
      return (
        <a key={i.label} role="menuitem" href={i.href} target="_blank" rel="noopener noreferrer"
          onClick={(e) => { e.stopPropagation(); close(false); }}
          className={cls(i.danger)} aria-label={i.ariaLabel} data-testid={i.testId}>
          {icon} {i.label}
        </a>
      );
    }
    return (
      <button key={i.label} type="button" role="menuitem" disabled={i.disabled}
        onClick={(e) => { e.stopPropagation(); close(); i.onSelect?.(); }}
        className={cls(i.danger)} aria-label={i.ariaLabel} data-testid={i.testId}>
        {icon} {i.label}
      </button>
    );
  };

  return (
    <div ref={wrap} className="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-11 h-11 grid place-items-center rounded-xl text-ink-secondary hover:text-ink-primary hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
        data-testid={buttonTestId}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={menuLabel}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 z-30 w-56 p-1 rounded-xl bg-surface-overlay border border-white/10 shadow-glass"
          data-testid={menuTestId}
        >
          {safe.map(render)}
          {safe.length > 0 && risky.length > 0 && <div className="my-1 h-px bg-white/10" role="separator" />}
          {risky.map(render)}
        </div>
      )}
    </div>
  );
}
