import { useEffect } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import TabBar from '../components/layout/TabBar';
import ItineraryTab from '../components/tabs/ItineraryTab';
import TodoTab from '../components/tabs/TodoTab';
import MapTab from '../components/tabs/MapTab';
import ClipboardTab from '../components/tabs/ClipboardTab';
import { useAppStore } from '../store';

export default function PlanWorkspace() {
  const { planId } = useParams<{ planId: string }>();
  const setActivePlan = useAppStore((s) => s.setActivePlan);

  useEffect(() => {
    if (planId) setActivePlan(planId);
    return () => setActivePlan(null);
  }, [planId, setActivePlan]);

  if (!planId) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-full min-h-0">
      <TabBar planId={planId} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Routes>
          <Route index element={<Navigate to="itinerary" replace />} />
          <Route path="itinerary" element={<ItineraryTab planId={planId} />} />
          <Route path="todo" element={<TodoTab planId={planId} />} />
          <Route path="map" element={<MapTab planId={planId} />} />
          <Route path="clipboard" element={<ClipboardTab planId={planId} />} />
          <Route path="*" element={<Navigate to="itinerary" replace />} />
        </Routes>
      </div>
    </div>
  );
}
