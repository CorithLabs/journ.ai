import { useEffect, useRef } from 'react';
import type { ActionMenuItem } from '../ui/ActionMenu';

interface Props {
  items: ActionMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * The trip list's right-click menu: the same actions as each trip's "More
 * actions" button, opened where the pointer is. It only offers them; the
 * sidebar carries them out, so what follows (an Undo, a message) outlives
 * this menu closing.
 */
export default function PlanContextMenu({ items, x, y, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const safe = items.filter((i) => !i.danger);
  const risky = items.filter((i) => i.danger);
  const row = (i: ActionMenuItem) => (
    <button
      key={i.label}
      role="menuitem"
      aria-label={i.ariaLabel}
      data-testid={i.testId}
      className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-surface-raised transition-colors ${
        i.danger ? 'text-status-danger' : 'text-ink-secondary hover:text-ink-primary'
      }`}
      onClick={() => { onClose(); i.onSelect?.(); }}
    >
      <span aria-hidden="true" className="shrink-0">{i.icon}</span>
      {i.label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Plan options"
      className="fixed z-50 w-48 bg-surface-overlay border border-white/10 rounded-card shadow-glass py-1"
      // Kept on screen when opened near the bottom or right edge.
      style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 200) }}
    >
      {safe.map(row)}
      {safe.length > 0 && risky.length > 0 && <hr className="border-white/5 my-1" />}
      {risky.map(row)}
    </div>
  );
}
