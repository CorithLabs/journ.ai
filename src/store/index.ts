import { create } from 'zustand';

export interface WeatherDay {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipProbability: number;
  windspeedMax: number;
  apparentTempMax: number;
}

export type ActiveTab = 'itinerary' | 'todo' | 'map' | 'clipboard';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface AppStore {
  // UI state (not persisted)
  activePlanId: string | null;
  activeTab: ActiveTab;
  agentPanelOpen: boolean;
  agentMessages: Message[];
  offlineBannerVisible: boolean;

  // Weather cache (session only)
  weatherByDate: Record<string, WeatherDay> | null;

  // AI provider (read from localStorage on init)
  aiProvider: 'byok' | 'mcp' | null;

  // Actions
  setActivePlan: (planId: string | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  toggleAgentPanel: () => void;
  setAgentPanelOpen: (open: boolean) => void;
  pushAgentMessage: (msg: Message) => void;
  clearAgentSession: () => void;
  setOfflineBanner: (visible: boolean) => void;
  setWeather: (data: Record<string, WeatherDay>) => void;
  setAiProvider: (provider: 'byok' | 'mcp' | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activePlanId: null,
  activeTab: 'itinerary',
  agentPanelOpen: false,
  agentMessages: [],
  offlineBannerVisible: false,
  weatherByDate: null,
  aiProvider: null,

  setActivePlan: (planId) => set({ activePlanId: planId }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleAgentPanel: () => set((s) => ({ agentPanelOpen: !s.agentPanelOpen })),
  setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),
  pushAgentMessage: (msg) =>
    set((s) => ({ agentMessages: [...s.agentMessages, msg] })),
  clearAgentSession: () => set({ agentMessages: [] }),
  setOfflineBanner: (visible) => set({ offlineBannerVisible: visible }),
  setWeather: (data) => set({ weatherByDate: data }),
  setAiProvider: (provider) => set({ aiProvider: provider }),
}));
