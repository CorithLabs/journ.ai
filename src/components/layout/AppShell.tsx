import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AmbientBackdrop from './AmbientBackdrop';

export default function AppShell() {
  return (
    <div
      // Transparent rather than bg-surface-base: the ground colour is painted
      // on <body>, so the ambient light sits between it and the app instead of
      // being covered by an opaque shell.
      className="relative flex h-screen overflow-hidden"
      data-testid="app-shell"
    >
      <AmbientBackdrop />
      {/* Everything below is lifted above the backdrop's stacking context. */}
      <Sidebar />
      <main
        className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden"
        data-testid="main-content"
      >
        <Outlet />
      </main>
    </div>
  );
}
