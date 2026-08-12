/**
 * One size for anything you type into.
 *
 * There were five: `px-3 py-2` in the newer dialogs, `px-2 py-1.5` and
 * `px-2 py-1` in the activity forms, and two more besides. The smallest came
 * out about 28px tall — under the 44px a finger needs, and visibly meaner than
 * the same field one tab across.
 *
 * The majority spelling wins, because it is both the most common and the only
 * one that clears the touch target.
 */
const SHAPE =
  'border border-white/10 rounded-xl px-3 py-2 text-sm ' +
  'text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50';

/**
 * A field in a dialog, which sits on `surface-overlay`.
 *
 * The ground is the one thing that genuinely differs between the two: a field
 * needs to be a step away from whatever is behind it, and the two surfaces sit
 * on opposite sides of the same input.
 */
export const fieldClass = `w-full bg-surface-raised ${SHAPE}`;

/** The same field on a raised card, where the step goes the other way. */
export const fieldOnCard = `w-full bg-surface-overlay ${SHAPE}`;

/**
 * Sized to its content rather than to the row.
 *
 * A clock needs about 110px and a category about 140px. Stretching them across
 * a full-width column is what made a form of four fields look like a form of
 * four identical slabs, and it wastes the width a wider dialog just bought.
 */
export const fieldClassAuto = `bg-surface-raised ${SHAPE}`;

/**
 * A notes box, in a size that admits notes are why the field exists.
 *
 * Editing an activity gave it two rows while the clipboard gave the same field
 * eight, and one of them forbade dragging it larger. `resize-y` is the cheapest
 * fix in the app: whatever height is chosen here, the person writing knows
 * better.
 */
export const notesClass = `${fieldClass} resize-y min-h-[6rem] leading-relaxed`;
export const notesOnCard = `${fieldOnCard} resize-y min-h-[6rem] leading-relaxed`;

/** Content-width, on a raised card. */
export const fieldOnCardAuto = `bg-surface-overlay ${SHAPE}`;
