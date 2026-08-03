import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Paperclip, PlusCircle } from 'lucide-react';
import { db, type ClipboardItem } from '../../db';
import { CLIPBOARD_TYPES } from '../clipboard/clipboardConstants';
import AddItemDrawer from '../clipboard/AddItemDrawer';
import ClipboardCard from '../clipboard/ClipboardCard';

interface Props {
  planId: string;
}

/**
 * Clipboard tab — lists saved items as cards grouped by type, with an
 * "Add item" drawer. Items are queried live from IndexedDB so new saves
 * appear immediately. Search/filter is layered on in a later story.
 */
export default function ClipboardTab({ planId }: Props) {
  const [showAdd, setShowAdd] = useState(false);
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

  return (
    <div className="flex flex-col h-full" data-testid="clipboard-tab">
      <div className="px-4 py-4 border-b border-white/5 shrink-0 flex items-center justify-between">
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

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Paperclip size={40} className="text-accent-muted mb-3" aria-hidden="true" />
            <p className="text-sm text-ink-primary mb-1">No items yet</p>
            <p className="text-xs text-ink-muted max-w-xs">
              Save boarding passes, hotel confirmations, and important documents here.
            </p>
          </div>
        )}

        {CLIPBOARD_TYPES.map((type) => {
          const group = items.filter((i) => i.type === type);
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
    </div>
  );
}
