import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { db } from '../../db';
import { addSampleTrip, SEEDED_FLAG } from '../../db/seed';
import { useIsMobile } from '../../hooks/useIsMobile';
import { versionLabel } from '../../utils/appVersion';

const media = (q: string) => {
  try { return window.matchMedia(q).matches; } catch { return false; }
};

/**
 * What the app sees on this device, to copy into a bug report.
 *
 * Phone or desktop layout is decided from the width the browser reports, and
 * a browser can report one the screen does not have — a zoom setting, a
 * desktop-site mode — so a layout bug on one phone cannot be diagnosed from
 * another. These are the numbers that decide it.
 */
export function deviceReport(isMobile: boolean, trips: number | null): string {
  const vv = window.visualViewport;
  const rows: [string, string][] = [
    ['App', versionLabel()],
    ['Layout', isMobile ? 'phone' : 'desktop'],
    ['Window (CSS px)', `${window.innerWidth} × ${window.innerHeight}`],
    ['Screen (CSS px)', `${window.screen.width} × ${window.screen.height}`],
    ['Pixel ratio', String(window.devicePixelRatio)],
    ['Visual viewport', vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)} at ${vv.scale}×` : 'n/a'],
    ['Phone-width match', String(media('(max-width: 767px)'))],
    ['Touch screen', String(media('(pointer: coarse)'))],
    ['Installed app', String(media('(display-mode: standalone)'))],
    ['Offline worker', typeof navigator !== 'undefined' && navigator.serviceWorker?.controller ? 'active' : 'none'],
    ['Viewport tag', document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? 'missing'],
    ['Trips stored', trips === null ? '…' : String(trips)],
    ['Sample trip added', localStorage.getItem(SEEDED_FLAG) === 'true' ? 'yes' : 'no'],
    ['Browser', navigator.userAgent],
  ];
  return rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}

export default function DeviceReport() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<number | null>(null);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [adding, setAdding] = useState(false);
  // Re-read on resize and rotation, so the numbers are the current ones.
  const [, setTick] = useState(0);

  useEffect(() => {
    db.plans.filter((p) => !p.deleted).count().then(setTrips).catch(() => setTrips(null));
    const bump = () => setTick((n) => n + 1);
    window.addEventListener('resize', bump);
    return () => window.removeEventListener('resize', bump);
  }, []);

  const report = deviceReport(isMobile, trips);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  const addSample = async () => {
    setAdding(true);
    try {
      const id = await addSampleTrip();
      navigate(`/plan/${id}/itinerary`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="device-report">
      <pre
        className="bg-surface-raised border border-white/10 rounded-xl p-3 text-[11px] leading-relaxed text-ink-secondary font-mono whitespace-pre-wrap break-words select-text"
        data-testid="device-report-text"
        // Selected in one tap when the clipboard is refused.
        onClick={(e) => { if (copied === 'failed') window.getSelection()?.selectAllChildren(e.currentTarget); }}
      >
        {report}
      </pre>
      {copied === 'failed' && <p className="text-xs text-ink-muted">Copying was refused; tap the text to select it.</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="min-h-11 flex items-center gap-1.5 text-xs px-3 rounded-xl border border-white/10 text-ink-secondary hover:text-ink-primary"
          data-testid="copy-device-report"
        >
          {copied === 'done' ? <><Check size={13} aria-hidden="true" /> Copied</> : <><Copy size={13} aria-hidden="true" /> Copy</>}
        </button>
        <button
          type="button"
          onClick={addSample}
          disabled={adding}
          className="min-h-11 text-xs px-3 rounded-xl border border-white/10 text-ink-secondary hover:text-ink-primary disabled:opacity-50"
          data-testid="add-sample-trip"
        >
          {adding ? 'Adding…' : 'Add the sample trip'}
        </button>
      </div>
    </div>
  );
}
