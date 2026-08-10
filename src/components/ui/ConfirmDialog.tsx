import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Asking the user before doing something they cannot undo.
 *
 * This was window.confirm, which is the wrong tool three ways over: it looks
 * like a browser security warning rather than part of the app, it cannot say
 * anything in more than one weight of plain text, and an installed PWA or a
 * mobile browser may suppress it outright — in which case a destructive action
 * either proceeds unasked or silently does nothing.
 *
 * The promise shape is deliberate. Every call site already read
 * `if (!(await confirmSomething())) return;`, so keeping that shape meant the
 * flows around them did not have to be turned inside out into callbacks.
 */
export interface ConfirmOptions {
  title: string;
  /** The consequence, in the user's terms. Skipped when the title says it all. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions are coloured as such. */
  tone?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setPending(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    setPending(null);
    resolver.current?.(ok);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
          // Dismissing by any route is a "no": the safe answer is the one that
          // does nothing.
          onClick={() => settle(false)}
          data-testid="confirm-backdrop"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={pending.body ? 'confirm-body' : undefined}
            className="w-full max-w-sm bg-surface-overlay border border-white/10 rounded-modal shadow-glass p-5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') settle(false); }}
            data-testid="confirm-dialog"
          >
            <div className="flex gap-3">
              {pending.tone === 'danger' && (
                <AlertTriangle size={18} className="text-status-danger shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-sm font-semibold text-ink-primary">{pending.title}</h2>
                {pending.body && (
                  <p id="confirm-body" className="mt-1 text-xs text-ink-secondary leading-relaxed">{pending.body}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                autoFocus
                onClick={() => settle(true)}
                className={`flex-1 font-semibold py-2 rounded-xl text-sm transition-colors ${
                  pending.tone === 'danger'
                    ? 'bg-status-danger hover:opacity-90 text-ink-primary'
                    : 'bg-accent hover:bg-accent-light text-ink-inverse'
                }`}
                data-testid="confirm-accept"
              >
                {pending.confirmLabel ?? 'Continue'}
              </button>
              <button
                onClick={() => settle(false)}
                className="px-4 py-2 rounded-xl text-sm text-ink-secondary border border-white/10 hover:text-ink-primary"
                data-testid="confirm-cancel"
              >
                {pending.cancelLabel ?? 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
