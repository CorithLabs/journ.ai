import { useState } from 'react';
import { SlotPicker } from '../itinerary/ActivityCard';
import { exactTime } from '../../utils/activityTime';
import { X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { db, type ClipboardItem } from '../../db';
import {
  CLIPBOARD_TYPES,
  type ClipboardType,
  BODY_MAX,
  BODY_WARN,
} from './clipboardConstants';
import FileDropzone, { type SelectedFile } from './FileDropzone';

interface Props {
  planId: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Slide-in drawer to add a new clipboard item.
 * Supports a text note (type + title + rich body) and an optional file
 * attachment (boarding pass PDF / image), stored as a native Blob in
 * IndexedDB with a 10 MB per-item cap enforced by FileDropzone.
 */
export default function AddItemDrawer({ planId, onClose, onSaved }: Props) {
  const [type, setType] = useState<ClipboardType>('Note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [time, setTime] = useState('');
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
        // Empty title → fall back to the file name, then the type as a default.
        title: title.trim() || file?.fileName || type,
        body: body.trim() ? body : undefined,
        time: time || undefined,
        fileBlob: file?.blob,
        fileName: file?.fileName,
        fileSize: file?.fileSize,
        createdAt: now,
        updatedAt: now,
      };
      await db.clipboard.add(item);
      // Preview URL is no longer needed once the item is persisted.
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
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
        className="absolute inset-0 bg-black/50 overlay-enter"
        aria-label="Close drawer"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="relative w-full sm:w-[420px] h-full bg-surface-raised border-l border-white/10 shadow-glass flex flex-col drawer-enter">
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

        <form onSubmit={save} className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-5" data-testid="add-item-form">
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

          {/* File upload */}
          <div>
            <span className="block text-sm text-ink-secondary mb-1.5">Attachment</span>
            <FileDropzone file={file} onFile={setFile} />
          </div>

          {/* Body */}
          <div>
            {/* Set here rather than only when editing: a check-in time is
                known as the confirmation is being saved, and going back to
                add it afterwards is a step nobody takes. It shows on the
                itinerary once the item is linked to a day. */}
            <div className="mb-4 space-y-1.5" data-testid="add-time">
              <p className="block text-sm text-ink-secondary">When, if it has a time</p>
              <SlotPicker value={time} onPick={setTime} />
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={exactTime(time) ?? ''}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label="Exact time"
                  className="bg-surface-overlay border border-white/10 rounded-xl px-3 py-1.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  data-testid="add-exact-time"
                />
                {time && (
                  <button type="button" onClick={() => setTime('')} className="text-xs text-ink-muted hover:underline" data-testid="add-clear-time">
                    Clear
                  </button>
                )}
              </div>
            </div>

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
