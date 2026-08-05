import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Link2, Unlink } from 'lucide-react';
import { db } from '../../db';
import { TYPE_BORDER, formatFileSize, isImageMime } from './clipboardConstants';
import LinkItineraryPicker from './LinkItineraryPicker';

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
  const [showPicker, setShowPicker] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const item = useLiveQuery(() => (itemId ? db.clipboard.get(itemId) : undefined), [itemId]);
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);

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

  const border = TYPE_BORDER[item.type] ?? 'border-slate-500';

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

  return (
    <div className="flex flex-col h-full" data-testid="clipboard-detail">
      <div className="px-4 py-3 border-b border-white/5 shrink-0 flex items-center gap-2">
        <button
          onClick={() => navigate(`/plan/${planId}/clipboard`)}
          className="p-1 rounded-lg text-ink-muted hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label="Back to clipboard"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
          {item.type}
        </span>
        <h1 className="text-base font-medium text-ink-primary truncate">{item.title}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
          {item.body && (
            <p className="text-sm text-ink-secondary whitespace-pre-wrap">{item.body}</p>
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
