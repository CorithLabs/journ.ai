import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Plan } from '../../db';
import { useAppStore, type Message } from '../../store';

export interface AgentChat {
  send: (text: string) => Promise<void>;
  busy: boolean;
}

/**
 * Hook driving the AI agent conversation. This baseline implementation records
 * the user's message to the session store and acknowledges it. The full
 * tool-calling behaviour (mutating itinerary / to-do / clipboard) is layered in
 * by a later story that replaces `send` with real provider calls.
 */
export function useAgentChat(plan: Plan | undefined): AgentChat {
  const pushAgentMessage = useAppStore((s) => s.pushAgentMessage);
  const [busy, setBusy] = useState(false);

  const send = async (text: string) => {
    setBusy(true);
    try {
      const userMsg: Message = {
        id: uuidv4(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      pushAgentMessage(userMsg);

      const reply: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: plan
          ? 'Got it — I can help with that. (Connect your key to enable full actions.)'
          : 'Open a plan to let me help with your trip.',
        timestamp: Date.now(),
      };
      pushAgentMessage(reply);
    } finally {
      setBusy(false);
    }
  };

  return { send, busy };
}
