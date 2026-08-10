import type { ReactNode } from 'react';

/**
 * The binder edge: a rail of actions down a card's right side.
 *
 * Introduced on itinerary cards because three buttons competing with the name
 * for horizontal room truncated it — "Visit to Royal Museum" became "Visit to
 * Royal Mu". Moving them to the edge gave the card body its full width back.
 *
 * The same reasoning applies to every card in the app, so this is shared
 * rather than copied: to-dos and clipboard items had their actions hidden
 * behind hover or buried a screen deep in a detail view.
 */
export function CardActionRail({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="shrink-0 flex flex-col justify-center gap-0.5 px-1 py-1 border-l border-white/10 bg-surface-base/30"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * One button on the rail.
 *
 * `active` is for actions with a state — pinned or not — so the rail can show
 * what is already true rather than only what can be done.
 */
export function CardAction({
  icon,
  label,
  onClick,
  tone = 'default',
  active = false,
  testId,
}: {
  icon: ReactNode;
  /** Both the accessible name and the tooltip: the rail has no room for text. */
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'accent';
  active?: boolean;
  testId?: string;
}) {
  /*
   * Destructive actions are red at rest, not only under a cursor. A delete
   * that looks like every other control until you hover it tells a user
   * nothing at the moment they are deciding where to press — and on a phone
   * there is no hover at all.
   *
   * At full strength, not dimmed: at 70% it measured 2.64 : 1 on an overlay,
   * under the 3:1 an icon needs to be seen as a control.
   */
  const base =
    tone === 'danger' ? 'text-status-danger' : active ? 'text-accent' : 'text-ink-muted';
  const hover =
    tone === 'danger'
      ? 'hover:text-status-danger hover:bg-status-danger/10'
      : 'hover:text-accent hover:bg-accent/10';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active ? true : undefined}
      // p-2 keeps every one of these a real touch target; the hover-revealed
      // versions these replace were unhittable on a phone.
      className={`p-2 rounded-lg focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none transition-colors ${base} ${hover}`}
      data-testid={testId}
    >
      {icon}
    </button>
  );
}
