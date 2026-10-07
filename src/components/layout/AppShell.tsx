import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AmbientBackdrop from './AmbientBackdrop';
import Onboarding from '../onboarding/Onboarding';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MOBILE_HEADER_SLOT } from './mobileHeader';
import { hasOnboarded, SHOW_ONBOARDING_EVENT } from '../../services/onboarding';

export default function AppShell() {
  // Read once on mount: re-reading would tear the flow down mid-step the
  // moment the flag is written.
  const [showIntro, setShowIntro] = useState(() => !hasOnboarded());
  const isMobile = useIsMobile();

  useEffect(() => {
    const open = () => setShowIntro(true);
    window.addEventListener(SHOW_ONBOARDING_EVENT, open);
    return () => window.removeEventListener(SHOW_ONBOARDING_EVENT, open);
  }, []);

  return (
    <div
      // Transparent rather than bg-surface-base: the ground colour is painted
      // on <body>, so the ambient light sits between it and the app instead of
      // being covered by an opaque shell.
      // h-full, not h-screen: #root is already sized to the dynamic viewport,
      // and h-screen would re-assert 100vh and reintroduce the overflow that
      // pushed the tab bar and Settings button off a phone screen.
      className="relative flex h-full overflow-hidden"
      data-testid="app-shell"
    >
      <AmbientBackdrop />
      {/* Everything below is lifted above the backdrop's stacking context. */}
      <Sidebar />
      <main
        // min-h-0 is load-bearing: a flex item defaults to min-height:auto, so
        // without it this can't shrink below its content and no descendant's
        // overflow-y-auto ever engages — which is why Settings wouldn't scroll.
        className="relative z-10 flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden"
        data-testid="main-content"
      >
        {/* A phone's top bar. The menu button floats over its left end, so
            nothing on any page sits under it, and a page can put what names it
            (the trip switcher) in the slot. No backdrop blur: a filter would
            trap the slot's fixed-position dialogs inside this bar. */}
        {isMobile && (
          <header
            className="shrink-0 box-content h-14 pt-[env(safe-area-inset-top)] flex items-center pl-16 pr-3 border-b border-white/5 bg-surface-raised"
            data-testid="mobile-header"
          >
            <div id={MOBILE_HEADER_SLOT} className="flex-1 min-w-0 flex items-center" />
          </header>
        )}
        <Outlet />
      </main>
      {showIntro && <Onboarding onClose={() => setShowIntro(false)} />}
    </div>
  );
}
