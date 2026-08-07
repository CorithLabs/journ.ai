import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, type Plan } from '../../db';
import { useAppStore, type Message } from '../../store';
import {
  chatWithTools,
  MissingKeyError,
  type ChatMessage,
  type ConversationMessage,
} from '../../services/aiClient';
import { AGENT_TOOLS, buildSystemPrompt, executeAgentAction } from './agentActions';

export interface AgentChat {
  send: (text: string) => Promise<void>;
  busy: boolean;
}

/**
 * Model turns allowed per user message. Enough for the realistic chains
 * (look something up → act on it → summarise), low enough that a model stuck
 * in a tool loop can't run up the user's own API bill.
 */
const MAX_TOOL_ROUNDS = 4;

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

      const conversation: ConversationMessage[] = [
        {
          role: 'system',
          content: buildSystemPrompt(plan, activeTab, { todos, clipboard }),
        },
        ...history,
      ];

      // The plan is re-read from IndexedDB after each write. Every itinerary
      // tool writes the whole `itinerary` array, so running two of them against
      // the same snapshot would make the second silently discard the first's
      // write — e.g. "add X and Y to Day 2" would land only Y.
      let current = plan;
      // True once a write tool has already told the user what changed, so the
      // model's closing summary isn't shown on top of it saying the same thing.
      let confirmed = false;
      // Results of calls already made this turn, keyed by name + arguments.
      // A model that doesn't accept a result and re-requests the same write
      // would otherwise apply it once per round — four identical activities
      // instead of one. Replaying the first result ends that loop without
      // touching the database again.
      const seen = new Map<string, string>();

      for (let round = 0; ; round++) {
        const { text: assistantText, toolCalls } = await chatWithTools(
          conversation,
          AGENT_TOOLS,
          { temperature: 0.3 },
        );

        if (toolCalls.length === 0) {
          // Nothing left to do: a clarifying question, an answer built from
          // tool results, or plain chat.
          if (assistantText) reply(assistantText);
          else if (!confirmed) reply("I'm not sure what to change — could you clarify?");
          return;
        }

        // Replay the model's own turn before its results — both providers
        // reject a result whose originating call isn't in the history.
        conversation.push({ role: 'assistant', content: assistantText, toolCalls });

        for (const tc of toolCalls) {
          if (tc.malformed) {
            // The model returned unparseable arguments.
            reply("I couldn't complete that action — try rephrasing.");
            confirmed = true;
            conversation.push({
              role: 'tool',
              toolCallId: tc.id,
              content: 'Error: the arguments were not valid JSON.',
            });
            continue;
          }
          const key = `${tc.name}:${JSON.stringify(tc.args)}`;
          const priorResult = seen.get(key);
          if (priorResult !== undefined) {
            conversation.push({ role: 'tool', toolCallId: tc.id, content: priorResult });
            continue;
          }

          const result = await executeAgentAction(current, { name: tc.name, args: tc.args });
          seen.set(key, result.data ?? result.message);
          // `data` marks a lookup: hand it to the model and stay silent, so it
          // can answer in prose rather than the user seeing raw JSON.
          if (result.data === undefined) {
            reply(result.message);
            confirmed = true;
          }
          conversation.push({
            role: 'tool',
            toolCallId: tc.id,
            content: result.data ?? result.message,
          });
          if (result.ok && result.data === undefined) {
            current = (await db.plans.get(plan.id)) ?? current;
          }
        }

        // Bound the loop: a model that keeps calling tools would otherwise spend
        // the user's own API credit indefinitely. Writes have already been
        // applied and confirmed at this point — only the closing prose is lost.
        if (round >= MAX_TOOL_ROUNDS - 1) {
          if (!confirmed) reply("I couldn't finish that — could you try a simpler request?");
          return;
        }
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
