import { WifiOff } from 'lucide-react';
import { useAppStore } from '../../store';

export default function OfflineBanner() {
  const visible = useAppStore((s) => s.offlineBannerVisible);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      data-testid="offline-banner"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-status-warning/90 text-ink-inverse text-sm font-medium"
    >
      <WifiOff size={16} aria-hidden="true" />
      <span>You&rsquo;re offline — AI features unavailable</span>
    </div>
  );
}
