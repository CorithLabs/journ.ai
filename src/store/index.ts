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

/** Which BYOK AI provider is currently selected. Mirrors `aitp_ai_provider`. */
export type SelectedProvider = 'openai' | 'anthropic';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /**
   * Follow-ups the assistant proposed with this reply, to tap instead of type.
   *
   * Carried on the message rather than held beside the thread so they belong
   * to the turn that offered them — scrolling back to an older reply should
   * not show what the newest one suggested.
   */
  suggestions?: string[];
}

const PROVIDER_STORAGE = 'aitp_ai_provider';

/** Read the persisted provider preference, defaulting to OpenAI. */
function initialSelectedProvider(): SelectedProvider {
  try {
    return localStorage.getItem(PROVIDER_STORAGE) === 'anthropic'
      ? 'anthropic'
      : 'openai';
  } catch {
    return 'openai';
  }
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
  // Which BYOK provider is active (openai | anthropic), initialised from
  // localStorage['aitp_ai_provider'] on boot.
  selectedProvider: SelectedProvider;

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
  setSelectedProvider: (provider: SelectedProvider) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activePlanId: null,
  activeTab: 'itinerary',
  agentPanelOpen: false,
  agentMessages: [],
  offlineBannerVisible: false,
  weatherByDate: null,
  aiProvider: null,
  selectedProvider: initialSelectedProvider(),

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
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),
}));
