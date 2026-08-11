import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Link2, Unlink, Pencil } from 'lucide-react';
import { db, type ClipboardItem } from '../../db';
import { TYPE_BORDER, CLIPBOARD_TYPES, formatFileSize, isImageMime } from './clipboardConstants';
import LinkItineraryPicker from './LinkItineraryPicker';
import { SlotPicker } from '../itinerary/ActivityCard';
import { exactTime } from '../../utils/activityTime';

interface Props {
  planId: string;
}

/**
 * Clipboard item detail view. Shows the item body / file, and lets the user
 * link it to an itinerary day (and optionally a specific activity). A clipboard
 * item can be linked to at most ONE location — re-linking replaces the link.
 */
export default function ClipboardItemDetail({ planId }: Props) {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<ClipboardItem['type']>('Note');
  const [time, setTime] = useState('');
  const [err, setErr] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const item = useLiveQuery(() => (itemId ? db.clipboard.get(itemId) : undefined), [itemId]);
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);

  /*
   * The Edit control on a card opens this view already in edit mode. Landing
   * on a read-only page after pressing a pencil is the bug this replaces.
   */
  const wantsEdit = searchParams.get('edit') === '1';

  /*
   * Back returns to wherever this was opened from. A clipboard item linked to
   * a day is reachable from the itinerary, and landing in the clipboard after
   * following it there loses the user's place in a trip they were reading.
   */
  const cameFrom = searchParams.get('from') === 'itinerary' ? 'itinerary' : 'clipboard';
  const backLabel = cameFrom === 'itinerary' ? 'Back to itinerary' : 'Back to clipboard';
  useEffect(() => {
    if (wantsEdit && item) {
      setTitle(item.title);
      setBody(item.body ?? '');
      setType(item.type);
      setTime(item.time ?? '');
      setEditing(true);
    }
    // Only on arrival: re-running would drag the user back into the editor
    // after they had cancelled out of it.
  }, [wantsEdit, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (item?.fileBlob) {
      const url = URL.createObjectURL(item.fileBlob);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setFileUrl(null);
    return undefined;
  }, [item?.fileBlob]);

  if (item === undefined || plan === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <div
          className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <p className="text-sm text-ink-secondary mb-3">This item could not be found.</p>
        <button
          onClick={() => navigate(`/plan/${planId}/clipboard`)}
          className="text-sm text-accent hover:underline"
        >
          Back to clipboard
        </button>
      </div>
    );
  }

  const linkedDay =
    item.linkedDayIndex !== undefined
      ? plan?.itinerary.find((d) => d.dayIndex === item.linkedDayIndex)
      : undefined;
  const linkedActivity =
    item.linkedActivityId && linkedDay
      ? linkedDay.activities.find((a) => a.id === item.linkedActivityId)
      : undefined;
  // Link exists but the referenced activity was deleted from the itinerary.
  const sourceRemoved =
    item.linkedActivityId !== undefined && linkedDay !== undefined && !linkedActivity;

  const border = TYPE_BORDER[item.type] ?? 'border-l-category-slate';

  const link = async (dayIndex: number, activityId?: string) => {
    await db.clipboard.update(item.id, {
      linkedDayIndex: dayIndex,
      linkedActivityId: activityId,
      updatedAt: new Date().toISOString(),
    });
    setShowPicker(false);
  };

  const unlink = async () => {
    await db.clipboard.update(item.id, {
      linkedDayIndex: undefined,
      linkedActivityId: undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  const isLinked = item.linkedDayIndex !== undefined;

  /*
   * A clipboard item's own content could not be changed anywhere in the app.
   * This view showed the title as a heading and the body as a paragraph, and
   * wrote nothing but the itinerary link — so a typo in a confirmation, or a
   * note that needed a line adding, meant deleting the item and saving it
   * again, losing the attached file with it.
   */
  const startEditing = () => {
    setTitle(item.title);
    setBody(item.body ?? '');
    setType(item.type);
    setTime(item.time ?? '');
    setErr('');
    setEditing(true);
  };

  const saveEdits = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setErr('A title is needed to find this again.');
      return;
    }
    await db.clipboard.update(item.id, {
      title: trimmed,
      body: body.trim() || undefined,
      type,
      time: time || undefined,
      updatedAt: new Date().toISOString(),
    });
    setEditing(false);
  };

  return (
    <div className="flex flex-col h-full" data-testid="clipboard-detail">
      <div className="px-4 py-3 border-b border-white/5 shrink-0 flex items-center gap-2">
        <button
          onClick={() => navigate(`/plan/${planId}/${cameFrom}`)}
          className="p-1 rounded-lg text-ink-muted hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label={backLabel}
          title={backLabel}
          data-testid="detail-back-btn"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
          {item.type}
        </span>
        <h1 className="text-base font-medium text-ink-primary truncate flex-1">{item.title}</h1>
        {!editing && (
          <button
            onClick={startEditing}
            className="shrink-0 p-2 rounded-lg text-ink-muted hover:text-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label="Edit item"
            title="Edit"
            data-testid="detail-edit-btn"
          >
            <Pencil size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {editing && (
          <div className="space-y-2 bg-surface-raised border border-accent/30 rounded-card p-3" data-testid="detail-editor">
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setErr(''); }}
              aria-label="Title"
              placeholder="Title"
              autoFocus
              className="w-full bg-surface-overlay border border-white/10 rounded-lg px-2 py-1.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
              data-testid="detail-title-input"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ClipboardItem['type'])}
              aria-label="Type"
              className="w-full bg-surface-overlay border border-white/10 rounded-lg px-2 py-1.5 text-sm text-ink-primary focus:outline-none"
              data-testid="detail-type-select"
            >
              {CLIPBOARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              aria-label="Notes"
              placeholder="Notes — a confirmation number, a door code, what time check-in opens"
              className="w-full bg-surface-overlay border border-white/10 rounded-lg px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none resize-none"
              data-testid="detail-body-input"
            />
            {/* Optional, and only meaningful once the item is linked to a
                day — an exact time is normalised to its part of the day the
                same way an activity's is. */}
            <div className="space-y-1.5" data-testid="detail-time">
              <p className="text-xs text-ink-secondary">When, if it has a time</p>
              <SlotPicker value={time} onPick={setTime} />
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={exactTime(time) ?? ''}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label="Exact time"
                  className="bg-surface-overlay border border-white/10 rounded-lg px-2 py-1 text-xs text-ink-primary focus:outline-none"
                  data-testid="detail-exact-time"
                />
                {time && (
                  <button type="button" onClick={() => setTime('')} className="text-xs text-ink-muted hover:underline" data-testid="detail-clear-time">
                    Clear
                  </button>
                )}
              </div>
            </div>

            {err && <p role="alert" className="text-xs text-status-danger" data-testid="detail-edit-error">{err}</p>}
            {/* The attachment is deliberately untouched: re-uploading a
                boarding pass to fix a typo in its title would be absurd. */}
            {item.fileName && (
              <p className="text-xs text-ink-muted">{item.fileName} stays attached.</p>
            )}
            <div className="flex gap-2 pt-1">
              <Button onClick={saveEdits} data-testid="detail-save-btn">Save</Button>
              <Button variant="secondary" onClick={() => setEditing(false)} data-testid="detail-cancel-btn">Cancel</Button>
            </div>
          </div>
        )}

        <div className={`border-l-2 ${border} pl-3`}>
          {/* File preview */}
          {item.fileName && (
            <div className="mb-4">
              {isImageMime(item.fileBlob?.type) && fileUrl ? (
                <img
                  src={fileUrl}
                  alt={item.fileName}
                  className="max-h-80 rounded-card border border-white/5"
                  data-testid="detail-image"
                />
              ) : (
                <div className="flex items-center gap-3 bg-surface-raised border border-white/10 rounded-card p-3">
                  <FileText size={24} className="text-accent" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-primary truncate">{item.fileName}</p>
                    {item.fileSize !== undefined && (
                      <p className="text-xs text-ink-muted">{formatFileSize(item.fileSize)}</p>
                    )}
                  </div>
                  {fileUrl && (
                    <a
                      href={fileUrl}
                      download={item.fileName}
                      className="ml-auto text-xs text-accent hover:underline"
                    >
                      Download
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Body */}
          {item.body ? (
            <p className="text-sm text-ink-secondary whitespace-pre-wrap">{item.body}</p>
          ) : !editing && (
            <button onClick={startEditing} className="text-sm text-ink-muted hover:text-accent" data-testid="detail-add-notes">
              Add notes
            </button>
          )}
        </div>

        {/* Link section */}
        <div className="border-t border-white/5 pt-4">
          <h2 className="text-sm font-semibold text-ink-secondary mb-2 uppercase tracking-wider">
            Itinerary link
          </h2>
          {isLinked ? (
            <div className="flex items-center gap-2 flex-wrap" data-testid="linked-badge">
              <span className="text-sm text-ink-primary bg-surface-raised border border-white/10 rounded-xl px-3 py-1.5">
                {sourceRemoved
                  ? `${linkedDay?.label ?? 'Day'} · Activity removed`
                  : linkedActivity
                    ? `${linkedDay?.label} · ${linkedActivity.name}`
                    : (linkedDay?.label ?? 'Linked day')}
              </span>
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs text-accent hover:underline"
                data-testid="relink-btn"
              >
                Change
              </button>
              <button
                onClick={unlink}
                className="flex items-center gap-1 text-xs text-ink-muted hover:text-status-danger"
                data-testid="unlink-btn"
              >
                <Unlink size={12} /> Unlink
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 text-sm text-accent border border-accent-muted rounded-xl px-3 py-1.5 hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
              data-testid="link-btn"
            >
              <Link2 size={14} /> Link to itinerary
            </button>
          )}
        </div>
      </div>

      {showPicker && plan && (
        <LinkItineraryPicker plan={plan} onClose={() => setShowPicker(false)} onLink={link} />
      )}
    </div>
  );
}
