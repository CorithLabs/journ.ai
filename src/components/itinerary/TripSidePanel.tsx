import { ChevronRight } from 'lucide-react';
import type { ClipboardItem, Plan, TodoItem } from '../../db';

interface Props {
  plan: Plan;
  todos: TodoItem[];
  clips: ClipboardItem[];
  onNavigate: (path: string) => void;
}

/** A panel's worth, not the whole list: the tabs are one tap away. */
const SHOWN = 5;

function Panel({ title, meta, onMore, accent, children, testId }: {
  title: string;
  meta?: string;
  onMore?: () => void;
  accent: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className={`rounded-card bg-surface-raised border border-white/10 border-t-[3px] ${accent} shadow-card p-5`} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="font-display font-semibold text-lg text-ink-primary">{title}</h3>
        {onMore ? (
          <button type="button" onClick={onMore} className="flex items-center gap-0.5 text-[11px] font-semibold text-ink-muted hover:text-accent">
            {meta}
            <ChevronRight size={12} aria-hidden="true" />
          </button>
        ) : (
          meta && <span className="text-[11px] font-semibold text-ink-muted">{meta}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Beside the days on a wide screen: what is still to do, what is filed
 * against the trip, and what it was planned around.
 *
 * Only on screens with room for it. On anything narrower these are the To-do
 * and Clipboard tabs, and repeating them under the last day would only make
 * the itinerary longer.
 */
export default function TripSidePanel({ plan, todos, clips, onNavigate }: Props) {
  const open = todos
    .filter((t) => t.status !== 'done')
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const done = todos.length - open.length;
  const filed = clips.filter((c) => c.linkedDayIndex !== undefined);
  const likes = plan.intake?.likes ?? [];
  const dislikes = plan.intake?.dislikes ?? [];

  return (
    <aside aria-label="Trip notes" className="space-y-4" data-testid="trip-side-panel">
      {todos.length > 0 && (
        <Panel
          title="To-do"
          meta={`${open.length} open`}
          onMore={() => onNavigate(`/plan/${plan.id}/todo`)}
          accent="border-t-category-amber"
          testId="side-todos"
        >
          <ul className="space-y-2.5">
            {open.slice(0, SHOWN).map((t) => (
              <li key={t.id} className="flex gap-2.5 text-sm text-ink-secondary">
                <span className="mt-1 w-3.5 h-3.5 rounded border-2 border-accent-muted shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block break-words">{t.title}</span>
                  <span className="block text-[11px] text-ink-muted">{t.category}</span>
                </span>
              </li>
            ))}
          </ul>
          {open.length === 0 && <p className="text-sm text-ink-secondary">All done.</p>}
          {done > 0 && <p className="text-[11px] text-ink-muted mt-3">{done} done</p>}
        </Panel>
      )}

      {filed.length > 0 && (
        <Panel
          title="Clipboard"
          meta={`${filed.length} linked`}
          onMore={() => onNavigate(`/plan/${plan.id}/clipboard`)}
          accent="border-t-category-violet"
          testId="side-clipboard"
        >
          <ul className="divide-y divide-white/5">
            {filed.slice(0, SHOWN).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(`/plan/${plan.id}/clipboard/${c.id}?from=itinerary`)}
                  className="w-full text-left py-2 first:pt-0 hover:text-accent"
                >
                  <span className="block text-sm font-medium text-ink-primary break-words">{c.title}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {c.type} · Day {(c.linkedDayIndex ?? 0) + 1}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(likes.length > 0 || dislikes.length > 0) && (
        <Panel title="Trip style" accent="border-t-category-emerald" testId="side-style">
          <div className="flex flex-wrap gap-1.5">
            {likes.map((l) => (
              <span key={`l-${l}`} className="text-xs px-2.5 py-1 rounded-full border border-status-success/40 text-status-success">{l}</span>
            ))}
            {dislikes.map((d) => (
              <span key={`d-${d}`} className="text-xs px-2.5 py-1 rounded-full border border-status-danger/40 text-status-danger">
                <span className="sr-only">Avoiding </span>{d}
              </span>
            ))}
          </div>
        </Panel>
      )}
    </aside>
  );
}
