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
import { splitReply } from './suggestions';
import { parseLocalCommand } from './localCommands';
import { latestUndoable, restoreSnapshot, takeSnapshot } from './undo';
import { hasAnyAiKey } from '../../services/aiKeyStatus';
import { describeWeather, packingFor, tripWeather } from '../../services/tripWeather';

export interface AgentChat {
  send: (text: string) => Promise<void>;
  /** Undo what one reply changed. */
  undo: (undoId: string) => Promise<void>;
  /** The trip's weather and what to pack, worked out without the AI. */
  brief: () => Promise<void>;
  busy: boolean;
}

/** "What's on during my trip?" — offered when there is an AI to ask. */
export const EVENTS_QUESTION = "What's on during my trip?";

/**
 * Model turns allowed per user message. Enough for the realistic chains
 * (look something up → act on it → summarise), low enough that a model stuck
 * in a tool loop can't run up the user's own API bill.
 */
const MAX_TOOL_ROUNDS = 4;

/** Tools that only read: no snapshot is needed before them. */
const READ_TOOLS = new Set(['find_activities', 'read_clipboard_item', 'get_weather']);

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
  const updateAgentMessage = useAppStore((s) => s.updateAgentMessage);
  const activeTab = useAppStore((s) => s.activeTab);
  const offline = useAppStore((s) => s.offlineBannerVisible);
  const [busy, setBusy] = useState(false);

  /*
   * Split here rather than at render, so the marker never reaches the store
   * and cannot be shown by anything that later reads a message's content.
   */
  const reply = (
    content: string,
    role: Message['role'] = 'assistant',
    extra: { undoId?: string; suggestions?: string[] } = {},
  ) => {
    const { text, suggestions } = role === 'assistant'
      ? splitReply(content)
      : { text: content, suggestions: [] };
    const all = [...suggestions, ...(extra.suggestions ?? [])];
    pushAgentMessage({
      id: uuidv4(),
      role,
      content: text,
      timestamp: Date.now(),
      suggestions: all.length ? all : undefined,
      ...(extra.undoId ? { undoId: extra.undoId } : {}),
    });
  };

  /** Put back what a reply changed, and say so on that reply. */
  const undo = async (undoId: string) => {
    const restored = await restoreSnapshot(undoId);
    const msgs = useAppStore.getState().agentMessages.filter((m) => m.undoId === undoId);
    for (const m of msgs) updateAgentMessage(m.id, { undone: true });
    reply(restored ? 'Undone — the trip is back as it was before that change.' : 'That change can no longer be undone.');
  };

  /*
   * The trip's weather, and what it means for packing, as soon as the chat is
   * opened — without the AI, so it costs nothing and needs no key. The
   * forecast when the trip is near enough; otherwise what those dates were
   * like in recent years.
   */
  const brief = async () => {
    if (!plan || offline) return;
    const weather = await tripWeather(plan).catch(() => null);
    if (!weather || weather.basis === 'none') return;
    const todos = await db.todos.where('planId').equals(plan.id).toArray();
    const have = new Set(todos.map((t) => t.title.toLowerCase()));
    const packing = packingFor(weather).filter((t) => !have.has(t.toLowerCase()));
    const intro = weather.basis === 'forecast' ? 'Here is the weather for your trip.' : 'Your trip is too far off for a forecast, so here is what those dates are usually like.';
    reply(
      [intro, '', describeWeather(weather), packing.length ? '\nWorth packing for it — tap to add to your to-dos.' : ''].join('\n'),
      'assistant',
      { suggestions: [...packing.map((t) => `Add to-do: ${t}`), ...(hasAnyAiKey() ? [EVENTS_QUESTION] : [])] },
    );
  };

  const send = async (text: string) => {
    reply(text, 'user');

    if (!plan) {
      reply('Open a plan first so I know what to work on.');
      return;
    }

    /*
     * Requests the app can carry out itself: no AI call, no wait, no key
     * needed. What the app cannot find goes on to the AI, which can read
     * looser wording.
     */
    const local = parseLocalCommand(text);
    if (local?.kind === 'undo') {
      const id = latestUndoable(useAppStore.getState().agentMessages.filter((m) => !m.undone).map((m) => m.undoId));
      if (id) await undo(id);
      else reply('There is nothing of mine to undo.');
      return;
    }
    if (local?.kind === 'action') {
      setBusy(true);
      try {
        const snapshot = await takeSnapshot(plan.id);
        let result = await executeAgentAction(plan, { name: local.name, args: local.args });
        if (!result.ok && local.fallback && /couldn't find/.test(result.message)) {
          result = await executeAgentAction(plan, local.fallback);
        }
        const unclear = !result.ok && /More than one/.test(result.message);
        if (result.ok || unclear || offline || !hasAnyAiKey()) {
          reply(result.message, 'assistant', result.ok && snapshot ? { undoId: snapshot } : {});
          return;
        }
      } finally {
        setBusy(false);
      }
    }

    if (!hasAnyAiKey()) {
      reply('That needs the AI: add a key in Settings. Without one I can still swap, move, remove and tick things off — e.g. "swap the museum with the market", "move lunch to day 2", "mark the train done", "undo".');
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
      // Taken before the first change, so one Undo reverses the whole reply.
      let undoId: string | null = null;

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

          if (!undoId && !READ_TOOLS.has(tc.name)) undoId = await takeSnapshot(plan.id);
          const result = await executeAgentAction(current, { name: tc.name, args: tc.args });
          seen.set(key, result.data ?? result.message);
          // `data` marks a lookup: hand it to the model and stay silent, so it
          // can answer in prose rather than the user seeing raw JSON.
          if (result.data === undefined) {
            reply(result.message, 'assistant', result.ok && undoId ? { undoId } : {});
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

  return { send, undo, brief, busy };
}
