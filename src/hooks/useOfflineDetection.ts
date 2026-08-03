import { useEffect } from 'react';
import { useAppStore } from '../store';

export function useOfflineDetection() {
  const setOfflineBanner = useAppStore((s) => s.setOfflineBanner);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleChange = (isOnline: boolean) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setOfflineBanner(!isOnline);
      }, 1000);
    };

    const onOnline = () => handleChange(true);
    const onOffline = () => handleChange(false);

    // Set initial state immediately (no debounce needed at mount)
    setOfflineBanner(!navigator.onLine);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOfflineBanner]);
}
