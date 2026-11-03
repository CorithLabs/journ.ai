import { useState } from 'react';
import SectionHead from '../ui/SectionHead';
import { useConfirm } from '../ui/ConfirmDialog';
import LinkItineraryPicker from '../clipboard/LinkItineraryPicker';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { db, type ClipboardItem } from '../../db';
import { ALL_FILTER, filterClipboard } from '../clipboard/filterClipboard';
import { useDebounce } from '../../hooks/useDebounce';
import AddItemDrawer from '../clipboard/AddItemDrawer';
import ClipboardCard from '../clipboard/ClipboardCard';

interface Props {
  planId: string;
}

/** Search appears once there is enough to search through. */
export const SEARCH_FROM = 6;

/**
 * Essentials' "Saved": the boarding passes, check-ins and booking emails.
 *
 * Was the Clipboard tab, grouped under six type headings with a chip for
 * each. On a phone, at the gate, that was a lot to get past to one boarding
 * pass. Now it is one list in trip order — what belongs to Day 1 first —
 * with the type on each card, and a search once the list is long enough to
 * need one.
 */
export default function ClipboardTab({ planId }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [linking, setLinking] = useState<ClipboardItem | null>(null);
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);
  const navigate = useNavigate();

  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  const items = useLiveQuery(
    () => db.clipboard.where('planId').equals(planId).sortBy('createdAt'),
    [planId],
  );

  if (items === undefined) {
    return (
      <div className="flex items-center justify-center py-8">
        <div
          className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"
          aria-label="Loading"
        />
      </div>
    );
  }

  const openDetail = (item: ClipboardItem) =>
    navigate(`/plan/${planId}/clipboard/${item.id}`);

  const stamp = () => new Date().toISOString();

  /**
   * Link a confirmation to the day it belongs to, or take the link off again.
   *
   * Unlinking asks first because nothing else records which day a voucher
   * was for, and re-finding it means opening every day in turn.
   */
  const togglePin = async (item: ClipboardItem) => {
    if (item.linkedDayIndex === undefined) {
      setLinking(item);
      return;
    }
    const ok = await confirm({
      title: `Unlink "${item.title}" from the itinerary?`,
      body: 'The item stays in your clipboard; only the link to the day is removed.',
      confirmLabel: 'Unlink',
    });
    if (!ok) return;
    await db.clipboard.update(item.id, {
      linkedDayIndex: undefined,
      linkedActivityId: undefined,
      updatedAt: stamp(),
    });
  };

  const removeItem = async (item: ClipboardItem) => {
    const ok = await confirm({
      title: `Delete "${item.title}"?`,
      body: item.fileName
        ? `The attached file (${item.fileName}) is deleted with it. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (ok) await db.clipboard.delete(item.id);
  };

  // Trip order: what belongs to a day, by day; then the rest, oldest first.
  const ordered = [...items].sort((a, b) =>
    (a.linkedDayIndex ?? Infinity) - (b.linkedDayIndex ?? Infinity) || a.createdAt.localeCompare(b.createdAt));
  const filtered = filterClipboard(ordered, debouncedQuery, ALL_FILTER);
  const isSearching = debouncedQuery.trim() !== '';

  return (
    <section aria-labelledby="saved" data-testid="clipboard-tab">
      <SectionHead id="saved" title="Saved" count={items.length} addLabel="Add item" onAdd={() => setShowAdd(true)} addTestId="add-item-btn" />

      {items.length >= SEARCH_FROM && (
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved…"
            aria-label="Search saved items"
            data-testid="clipboard-search"
            className="w-full bg-surface-overlay border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-base md:text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
      )}

      {items.length === 0 && (
        <p className="py-3 text-sm text-ink-muted" data-testid="saved-empty">
          Boarding passes, check-ins and booking emails go here.
        </p>
      )}

      {items.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center py-8 text-center" data-testid="no-results">
          <p className="text-sm text-ink-primary mb-3">Nothing saved matches that</p>
          <button
            onClick={() => setQuery('')}
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light border border-accent-muted rounded-xl px-3 py-1.5"
            data-testid="clear-search-btn"
          >
            <X size={14} /> Clear
          </button>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((item) => (
          <ClipboardCard
            key={item.id}
            item={item}
            onClick={() => openDetail(item)}
            onEdit={() => navigate(`/plan/${planId}/clipboard/${item.id}?edit=1`)}
            onPin={() => togglePin(item)}
            onDelete={() => removeItem(item)}
          />
        ))}
      </div>

      {/* The picker needs the itinerary to choose a day from, so a plan with
          no days yet simply has nothing to link to. */}
      {linking && plan && (
        <LinkItineraryPicker
          plan={plan}
          onClose={() => setLinking(null)}
          onLink={async (dayIndex, activityId) => {
            await db.clipboard.update(linking.id, {
              linkedDayIndex: dayIndex,
              linkedActivityId: activityId,
              updatedAt: stamp(),
            });
            setLinking(null);
          }}
        />
      )}

      {showAdd && (
        <AddItemDrawer
          planId={planId}
          onClose={() => setShowAdd(false)}
          onSaved={() => setShowAdd(false)}
        />
      )}

      <span className="sr-only" data-testid="search-active">
        {isSearching ? 'filtered' : 'all'}
      </span>
    </section>
  );
}
