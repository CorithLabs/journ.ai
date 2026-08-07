import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, type Plan } from '../../db';
import { useAppStore, type Message } from '../../store';
import { chatWithTools, MissingKeyError, type ChatMessage } from '../../services/aiClient';
import { AGENT_TOOLS, buildSystemPrompt, executeAgentAction } from './agentActions';

export interface AgentChat {
  send: (text: string) => Promise<void>;
  busy: boolean;
}

/**
 * Drives the AI agent conversation. Sends the session history + a
 * context-rich system prompt through the shared provider-agnostic aiClient
 * (`chatWithTools`) with the agent tool definitions. Routing to OpenAI or
 * Anthropic is decided inside aiClient based on the active provider — the
 * agent code never talks to a provider endpoint directly. If the model
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
      // Only user/assistant turns are sent as prior context.
      const history: ChatMessage[] = useAppStore
        .getState()
        .agentMessages.filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Fetched into the prompt rather than exposed as read tools: the loop is
      // single-shot, so a tool that returns data gives the model nothing it can
      // act on. This is what lets it answer "what's still on my to-do list?".
      const [todos, clipboard] = await Promise.all([
        db.todos.where('planId').equals(plan.id).toArray(),
        db.clipboard.where('planId').equals(plan.id).toArray(),
      ]);

      const { text: assistantText, toolCalls } = await chatWithTools(
        [
          {
            role: 'system',
            content: buildSystemPrompt(plan, activeTab, { todos, clipboard }),
          },
          ...history,
        ],
        AGENT_TOOLS,
        { temperature: 0.3 },
      );

      if (toolCalls.length === 0) {
        // No action — the model asked a clarifying question or chatted.
        reply(assistantText || "I'm not sure what to change — could you clarify?");
        return;
      }

      // The plan is re-read from IndexedDB before each call. Every itinerary
      // tool writes the whole `itinerary` array, so running two of them against
      // the same snapshot would make the second silently discard the first's
      // write — e.g. "add X and Y to Day 2" would land only Y.
      let current = plan;
      for (const tc of toolCalls) {
        if (tc.malformed) {
          // The model returned unparseable arguments.
          reply("I couldn't complete that action — try rephrasing.");
          continue;
        }
        const result = await executeAgentAction(current, { name: tc.name, args: tc.args });
        reply(result.message);
        if (result.ok) current = (await db.plans.get(plan.id)) ?? current;
      }
    } catch (err) {
      if (err instanceof MissingKeyError) {
        reply('Set up your API key in Settings to use the AI agent.');
      } else {
        reply("I couldn't complete that action — try rephrasing.");
      }
    } finally {
      setBusy(false);
    }
  };

  return { send, busy };
}
