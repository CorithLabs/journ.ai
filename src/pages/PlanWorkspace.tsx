import { useEffect } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TabBar from '../components/layout/TabBar';
import ItineraryTab from '../components/tabs/ItineraryTab';
import TodoTab from '../components/tabs/TodoTab';
import MapTab from '../components/tabs/MapTab';
import ClipboardTab from '../components/tabs/ClipboardTab';
import ClipboardItemDetail from '../components/clipboard/ClipboardItemDetail';
import AgentButton from '../components/agent/AgentButton';
import AgentPanel from '../components/agent/AgentPanel';
import DemoBanner from '../components/plans/DemoBanner';
import { useAppStore } from '../store';
import { db } from '../db';
import { useWeather } from '../hooks/useWeather';

/**
 * Inner component that has access to plan data and triggers weather fetch.
 */
function PlanWeatherLoader({ planId }: { planId: string }) {
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  // Fetch weather whenever the plan (destination / dates) changes
  useWeather(plan);
  return null;
}

export default function PlanWorkspace() {
  const { planId } = useParams<{ planId: string }>();
  const setActivePlan = useAppStore((s) => s.setActivePlan);
  const setAgentPanelOpen = useAppStore((s) => s.setAgentPanelOpen);
  const clearAgentSession = useAppStore((s) => s.clearAgentSession);

  useEffect(() => {
    if (planId) setActivePlan(planId);
    return () => setActivePlan(null);
  }, [planId, setActivePlan]);

  // Reset the agent session when switching to a different plan.
  useEffect(() => {
    setAgentPanelOpen(false);
    clearAgentSession();
  }, [planId, setAgentPanelOpen, clearAgentSession]);

  if (!planId) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Weather loader — invisible, side-effect only */}
      <PlanWeatherLoader planId={planId} />
      {/* Demo banner — renders only for the seeded demo plan, until dismissed */}
      <DemoBanner planId={planId} />
      <TabBar planId={planId} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Routes>
          <Route index element={<Navigate to="itinerary" replace />} />
          <Route path="itinerary" element={<ItineraryTab planId={planId} />} />
          <Route path="todo" element={<TodoTab planId={planId} />} />
          <Route path="map" element={<MapTab planId={planId} />} />
          <Route path="clipboard" element={<ClipboardTab planId={planId} />} />
          <Route path="clipboard/:itemId" element={<ClipboardItemDetail planId={planId} />} />
          <Route path="*" element={<Navigate to="itinerary" replace />} />
        </Routes>
      </div>

      {/* Persistent AI agent — available on every tab within this plan */}
      <AgentButton />
      <AgentPanel planId={planId} />
    </div>
  );
}
