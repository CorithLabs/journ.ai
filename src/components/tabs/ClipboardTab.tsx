import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Paperclip, PlusCircle, Search, X } from 'lucide-react';
import { db, type ClipboardItem } from '../../db';
import { CLIPBOARD_TYPES } from '../clipboard/clipboardConstants';
import {
  ALL_FILTER,
  filterClipboard,
  type TypeFilter,
} from '../clipboard/filterClipboard';
import { useDebounce } from '../../hooks/useDebounce';
import AddItemDrawer from '../clipboard/AddItemDrawer';
import ClipboardCard from '../clipboard/ClipboardCard';

interface Props {
  planId: string;
}

const FILTER_CHIPS: TypeFilter[] = [ALL_FILTER, ...CLIPBOARD_TYPES];

/**
 * Clipboard tab — lists saved items as cards grouped by type, with a
 * debounced search input and type filter chips. Search/filter state is
 * ephemeral UI state only (not persisted between sessions).
 */
export default function ClipboardTab({ planId }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL_FILTER);
  const debouncedQuery = useDebounce(query, 200);
  const navigate = useNavigate();

  const items = useLiveQuery(
    () => db.clipboard.where('planId').equals(planId).sortBy('createdAt'),
    [planId],
  );

  if (items === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <div
          className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"
          aria-label="Loading"
        />
      </div>
    );
  }

  const openDetail = (item: ClipboardItem) =>
    navigate(`/plan/${planId}/clipboard/${item.id}`);

  const filtered = filterClipboard(items, debouncedQuery, typeFilter);
  const isSearching = debouncedQuery.trim() !== '' || typeFilter !== ALL_FILTER;

  const clearSearch = () => {
    setQuery('');
    setTypeFilter(ALL_FILTER);
  };

  return (
    <div className="flex flex-col h-full" data-testid="clipboard-tab">
      <div className="px-4 py-4 border-b border-white/5 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">Clipboard</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm text-accent hover:text-accent-light focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none rounded-lg px-1"
            data-testid="add-item-btn"
            aria-label="Add item"
          >
            <PlusCircle size={16} /> Add item
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clipboard…"
            aria-label="Search clipboard items"
            data-testid="clipboard-search"
            className="w-full bg-surface-overlay border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        {/* Type filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter by type">
          {FILTER_CHIPS.map((chip) => {
            const active = typeFilter === chip;
            return (
              <button
                key={chip}
                onClick={() => setTypeFilter(chip)}
                aria-pressed={active}
                data-testid={`filter-chip-${chip}`}
                className={`shrink-0 text-xs px-3 py-1 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none ${
                  active
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'border-white/10 text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-6">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Paperclip size={40} className="text-accent-muted mb-3" aria-hidden="true" />
            <p className="text-sm text-ink-primary mb-1">No items yet</p>
            <p className="text-xs text-ink-muted max-w-xs">
              Save boarding passes, hotel confirmations, and important documents here.
            </p>
          </div>
        )}

        {items.length > 0 && filtered.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-16 text-center"
            data-testid="no-results"
          >
            <p className="text-sm text-ink-primary mb-3">No items match your search</p>
            <button
              onClick={clearSearch}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light border border-accent-muted rounded-xl px-3 py-1.5"
              data-testid="clear-search-btn"
            >
              <X size={14} /> Clear
            </button>
          </div>
        )}

        {CLIPBOARD_TYPES.map((type) => {
          const group = filtered.filter((i) => i.type === type);
          if (!group.length) return null;
          return (
            <section key={type} aria-label={`${type} items`}>
              <h3 className="text-sm font-semibold text-ink-secondary mb-2 uppercase tracking-wider">
                {type}
              </h3>
              <div className="space-y-2">
                {group.map((item) => (
                  <ClipboardCard key={item.id} item={item} onClick={() => openDetail(item)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {showAdd && (
        <AddItemDrawer
          planId={planId}
          onClose={() => setShowAdd(false)}
          onSaved={() => setShowAdd(false)}
        />
      )}

      {/* isSearching drives no-results vs empty-state distinction */}
      <span className="sr-only" data-testid="search-active">
        {isSearching ? 'filtered' : 'all'}
      </span>
    </div>
  );
}
