import { useEffect } from 'react';

interface Props {
  message: string;
  duration?: number;
  onDismiss: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function Toast({ message, duration = 5000, onDismiss, action }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-overlay border border-white/10 shadow-glass text-sm text-ink-primary"
    >
      <span>{message}</span>
      {action && (
        <button
          className="text-accent font-semibold hover:underline"
          onClick={() => {
            action.onClick();
            onDismiss();
          }}
        >
          {action.label}
        </button>
      )}
      <button
        className="text-ink-muted hover:text-ink-primary ml-1"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
