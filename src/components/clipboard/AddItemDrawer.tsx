import { useState } from 'react';
import { X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { db, type ClipboardItem } from '../../db';
import {
  CLIPBOARD_TYPES,
  type ClipboardType,
  BODY_MAX,
  BODY_WARN,
} from './clipboardConstants';

interface Props {
  planId: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Slide-in drawer to add a new clipboard item.
 * Supports a text note (type + title + rich body). File upload is layered
 * in via the FileDropzone in a later story.
 */
export default function AddItemDrawer({ planId, onClose, onSaved }: Props) {
  const [type, setType] = useState<ClipboardType>('Note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const overLimit = body.length > BODY_MAX;
  const nearLimit = body.length >= BODY_WARN;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (overLimit || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const item: ClipboardItem = {
        id: uuidv4(),
        planId,
        type,
        // Empty title → fall back to the type as a default title
        title: title.trim() || type,
        body: body.trim() ? body : undefined,
        createdAt: now,
        updatedAt: now,
      };
      await db.clipboard.add(item);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Add clipboard item">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/50"
        aria-label="Close drawer"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="relative w-full sm:w-[420px] h-full bg-surface-raised border-l border-white/10 shadow-glass flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <h2 className="text-lg font-semibold text-ink-primary">Add item</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-ink-muted hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={save} className="flex-1 overflow-y-auto px-5 py-5 space-y-5" data-testid="add-item-form">
          {/* Type selector */}
          <div>
            <label htmlFor="clip-type" className="block text-sm text-ink-secondary mb-1.5">
              Type
            </label>
            <select
              id="clip-type"
              value={type}
              onChange={(e) => setType(e.target.value as ClipboardType)}
              className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
              data-testid="type-select"
            >
              {CLIPBOARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="clip-title" className="block text-sm text-ink-secondary mb-1.5">
              Title
            </label>
            <input
              id="clip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. ${type}`}
              className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
              data-testid="title-input"
            />
          </div>

          {/* Body */}
          <div>
            <label htmlFor="clip-body" className="block text-sm text-ink-secondary mb-1.5">
              Notes
            </label>
            <textarea
              id="clip-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Confirmation numbers, email text, notes…"
              className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 resize-y"
              data-testid="body-input"
            />
            {nearLimit && (
              <p
                role="alert"
                className={`mt-1 text-xs ${overLimit ? 'text-status-danger' : 'text-status-warning'}`}
              >
                {overLimit
                  ? `Body exceeds the ${BODY_MAX.toLocaleString()} character limit.`
                  : `Approaching the ${BODY_MAX.toLocaleString()} character limit (${body.length.toLocaleString()}).`}
              </p>
            )}
          </div>
        </form>

        <div className="px-5 py-4 border-t border-white/5 shrink-0">
          <button
            type="submit"
            onClick={save}
            disabled={saving || overLimit}
            className="w-full bg-accent hover:bg-accent-light disabled:opacity-60 text-ink-inverse font-semibold py-2 rounded-xl text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            data-testid="save-item-btn"
          >
            {saving ? 'Saving…' : 'Save item'}
          </button>
        </div>
      </div>
    </div>
  );
}
