import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Plan } from '../../db';
import { useAppStore, type Message } from '../../store';
import { getApiKey } from '../../services/aiKey';
import { AGENT_TOOLS, buildSystemPrompt, executeAgentAction } from './agentActions';

export interface AgentChat {
  send: (text: string) => Promise<void>;
  busy: boolean;
}

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
}

/**
 * Drives the AI agent conversation. Sends the session history + a
 * context-rich system prompt to OpenAI with tool definitions. If the model
 * returns a tool call, it is executed against IndexedDB and the UI updates in
 * real time (Dexie liveQuery). Each action is confirmed back to the user.
 * Conversation lives in the Zustand session store (not persisted).
 */
export function useAgentChat(plan: Plan | undefined): AgentChat {
  const pushAgentMessage = useAppStore((s) => s.pushAgentMessage);
  const activeTab = useAppStore((s) => s.activeTab);
  const offline = useAppStore((s) => s.offlineBannerVisible);
  const [busy, setBusy] = useState(false);

  const reply = (content: string, role: Message['role'] = 'assistant') =>
    pushAgentMessage({ id: uuidv4(), role, content, timestamp: Date.now() });

  const send = async (text: string) => {
    reply(text, 'user');

    if (!plan) {
      reply('Open a plan first so I know what to work on.');
      return;
    }
    if (offline) {
      reply("You're offline — I can't reach the AI right now, but your data is safe.");
      return;
    }

    setBusy(true);
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        reply('Set up your API key in Settings to use the AI agent.');
        return;
      }

      // Only user/assistant turns are sent as prior context.
      const history = useAppStore
        .getState()
        .agentMessages.filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: buildSystemPrompt(plan, activeTab) },
            ...history,
          ],
          tools: AGENT_TOOLS,
          tool_choice: 'auto',
          temperature: 0.3,
        }),
      });

      if (!resp.ok) {
        reply("I couldn't complete that action — try rephrasing.");
        return;
      }

      const data = (await resp.json()) as ChatCompletionResponse;
      const message = data.choices?.[0]?.message;
      const toolCalls = message?.tool_calls ?? [];

      if (toolCalls.length === 0) {
        // No action — the model asked a clarifying question or chatted.
        reply(message?.content?.trim() || "I'm not sure what to change — could you clarify?");
        return;
      }

      for (const tc of toolCalls) {
        const name = tc.function?.name;
        if (!name) {
          reply("I couldn't complete that action — try rephrasing.");
          continue;
        }
        let args: Record<string, unknown> = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          reply("I couldn't complete that action — try rephrasing.");
          continue;
        }
        const result = await executeAgentAction(plan, { name, args });
        reply(result.message);
      }
    } catch {
      reply("I couldn't complete that action — try rephrasing.");
    } finally {
      setBusy(false);
    }
  };

  return { send, busy };
}
