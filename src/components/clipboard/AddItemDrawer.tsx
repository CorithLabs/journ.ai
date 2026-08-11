import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';
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
  const isMobile = useIsMobile();
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

  /*
   * Was a drawer sliding in from the right. Adding a clipboard item is the
   * same job as adding an activity or a to-do, and doing it a third way meant
   * a third thing to learn — including a different place to look for how to
   * leave.
   */
  return (
    <Modal title="Add item" onClose={onClose} anchor={isMobile ? 'top' : 'center'} width="md">
        <form onSubmit={save} className="space-y-5" data-testid="add-item-form">
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
        <div className="flex gap-2 pt-1">
            <Button type="submit" onClick={save} disabled={saving || overLimit} data-testid="save-item-btn">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={onClose} data-testid="cancel-item-btn">Cancel</Button>
          </div>
        </form>
    </Modal>
  );
}
