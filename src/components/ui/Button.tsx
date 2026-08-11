import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * One button, so the app stops having three.
 *
 * Editing an activity ended in a text link reading "Done"; editing a to-do
 * ended in nothing at all, saving silently when the field lost focus; editing
 * a clipboard item ended in a full-width accent slab. Three surfaces doing the
 * same job asked for it three different ways, and only one of them said what
 * pressing it would do.
 *
 * Save is the word, and it is sized to its label rather than to its container.
 * A full-width primary button reads as the end of a whole flow — signing up,
 * checking out — and using it to confirm a title edit overstates the moment.
 */
type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent hover:bg-accent-light text-ink-inverse font-semibold',
  secondary: 'border border-white/10 text-ink-secondary hover:text-ink-primary hover:border-white/20',
  // Solid status fills take the inverse ink: a label on this red measured
  // 3.44 against ink-primary, which is a button failing to be readable while
  // asking for something irreversible.
  danger: 'bg-status-danger hover:opacity-90 text-ink-inverse font-semibold',
  quiet: 'text-ink-secondary hover:text-ink-primary',
};

const SIZES: Record<Size, string> = {
  // Both keep a 32px+ target while staying inline-sized; sm suits an editor
  // inside a card, md a modal's own footer.
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Only for a genuine end-of-flow action, not for confirming an edit. */
  fullWidth?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
