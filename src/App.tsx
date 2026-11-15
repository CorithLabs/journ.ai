import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import HomePage from './pages/HomePage';
import PlanWorkspace from './pages/PlanWorkspace';
import SettingsPage from './pages/SettingsPage';
import NewPlanPage from './pages/NewPlanPage';
import DemoPage from './pages/DemoPage';
import OfflineBanner from './components/layout/OfflineBanner';
import { useOfflineDetection } from './hooks/useOfflineDetection';
import { ConfirmProvider } from './components/ui/ConfirmDialog';

export default function App() {
  useOfflineDetection();

  return (
    <ConfirmProvider>
      <OfflineBanner />
      <Routes>
        {/* Outside the shell, so the introduction is marked seen before it mounts. */}
        <Route path="demo" element={<DemoPage />} />
        <Route path="/" element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="plan/new" element={<NewPlanPage />} />
          <Route path="plan/:planId/*" element={<PlanWorkspace />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ConfirmProvider>
  );
}
