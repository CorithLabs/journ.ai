import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppShell() {
  return (
    <div
      className="flex h-screen bg-surface-base overflow-hidden"
      data-testid="app-shell"
    >
      <Sidebar />
      <main
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
        data-testid="main-content"
      >
        <Outlet />
      </main>
    </div>
  );
}
