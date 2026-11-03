import { Plus } from 'lucide-react';

interface Props {
  id: string;
  title: string;
  count?: number;
  /** Accessible name of the add button, e.g. "Add task". */
  addLabel: string;
  onAdd: () => void;
  addTestId?: string;
}

/**
 * A section's title with its own Add beside it, at thumb height. Each section
 * of Essentials adds its own kind of thing, so the button sits with the list
 * it adds to rather than one shared button asking which.
 */
export default function SectionHead({ id, title, count, addLabel, onAdd, addTestId }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2">
      <h2 id={id} className="text-sm font-semibold uppercase tracking-wider text-ink-secondary">
        {title}
        {count !== undefined && count > 0 && <span className="ml-2 text-ink-muted font-normal normal-case tracking-normal">{count}</span>}
      </h2>
      <button
        type="button"
        onClick={onAdd}
        aria-label={addLabel}
        className="h-11 -my-2 flex items-center gap-1.5 px-3 rounded-xl text-sm font-medium text-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
        data-testid={addTestId}
      >
        <Plus size={16} aria-hidden="true" /> Add
      </button>
    </div>
  );
}
