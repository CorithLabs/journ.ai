import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * One modal, so adding a thing works the same wherever you are.
 *
 * Adding an activity opened a dialog, adding a to-do unfolded a form inside
 * the list, and adding a clipboard item slid a drawer in from the right. Three
 * ways to do the same thing, each with its own idea of how to leave.
 *
 * Rendered through a portal for the same reason the trip settings are: the
 * tab bar carries backdrop-blur, and backdrop-filter creates a stacking
 * context that traps a fixed child however high its z-index goes.
 */
export default function Modal({
  title,
  onClose,
  children,
  /**
   * Pin to the top instead of centring. For a form on a phone, where the
   * on-screen keyboard covers the lower half of the screen and takes the
   * fields with it.
   */
  anchor = 'center',
  width = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  anchor?: 'center' | 'top';
  width?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const maxWidth = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }[width];

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center p-4 bg-black/70 backdrop-blur-glass overlay-enter ${
        anchor === 'top' ? 'items-start pt-4' : 'items-center'
      }`}
      onClick={onClose}
      data-testid="modal-scrim"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidth} max-h-full overflow-y-auto bg-surface-overlay border border-white/10 rounded-modal shadow-glass panel-enter`}
        data-testid="modal"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 sticky top-0 bg-surface-overlay z-10">
          <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label={`Close ${title}`}
            data-testid="modal-close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The way into any of them.
 *
 * Green, because it adds — the same green the + between itinerary cards uses,
 * against the red that removes. It was a small accent-coloured text link in a
 * header on two of the three tabs, which is the least visible thing on the
 * screen at the moment someone is looking for how to start.
 */
export function AddButton({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-status-success/40 text-status-success text-sm font-medium hover:bg-status-success/10 hover:border-status-success transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
      data-testid={testId}
    >
      <span className="text-base leading-none">+</span> {label}
    </button>
  );
}
