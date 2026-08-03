import { v4 as uuidv4 } from 'uuid';
import { db, type Plan, type Activity, type ClipboardItem, type TodoItem } from '../../db';

/**
 * Tool definitions exposed to the AI provider. The model returns one of these
 * as a tool call; executeAgentAction applies it to IndexedDB.
 */
export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_activity',
      description: 'Add a new activity to a specific day of the current plan itinerary.',
      parameters: {
        type: 'object',
        properties: {
          dayIndex: { type: 'integer', description: '0-based day index' },
          name: { type: 'string' },
          time: { type: 'string', description: 'HH:MM 24h, e.g. 08:00' },
          locationName: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['dayIndex', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_todo',
      description: "Mark a to-do task as done by matching its title (case-insensitive substring).",
      parameters: {
        type: 'object',
        properties: {
          titleMatch: { type: 'string', description: 'Part of the task title to match' },
        },
        required: ['titleMatch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_clipboard',
      description: 'Save a note to the clipboard for the current plan.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['Note', 'Boarding Pass', 'Hotel', 'Email', 'Location', 'Other'],
          },
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
] as const;

export type AgentActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

interface RawToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Execute a single tool call against IndexedDB for the given plan.
 * Returns a confirmation message on success, or a friendly error otherwise.
 * Pure with respect to inputs — all state changes go through `db`.
 */
export async function executeAgentAction(
  plan: Plan,
  call: RawToolCall,
): Promise<AgentActionResult> {
  try {
    switch (call.name) {
      case 'add_activity': {
        const dayIndex = Number(call.args.dayIndex);
        const name = String(call.args.name ?? '').trim();
        if (!name) return { ok: false, message: 'I need an activity name to add it.' };
        const day = plan.itinerary.find((d) => d.dayIndex === dayIndex);
        if (!day) {
          return {
            ok: false,
            message: `There is no Day ${dayIndex + 1} in this plan.`,
          };
        }
        const activity: Activity = {
          id: uuidv4(),
          name,
          time: typeof call.args.time === 'string' ? call.args.time : '09:00',
          locationName:
            typeof call.args.locationName === 'string' ? call.args.locationName : '',
          notes: typeof call.args.notes === 'string' ? call.args.notes : '',
          pinnedToTodo: false,
        };
        const itinerary = plan.itinerary.map((d) =>
          d.dayIndex === dayIndex ? { ...d, activities: [...d.activities, activity] } : d,
        );
        await db.plans.update(plan.id, {
          itinerary,
          updatedAt: new Date().toISOString(),
        });
        return {
          ok: true,
          message: `Done — I've added ${activity.name} to Day ${dayIndex + 1} at ${activity.time}.`,
        };
      }

      case 'complete_todo': {
        const match = String(call.args.titleMatch ?? '').trim().toLowerCase();
        if (!match) return { ok: false, message: 'Which task should I mark as done?' };
        const todos: TodoItem[] = await db.todos
          .where('planId')
          .equals(plan.id)
          .toArray();
        const target = todos.find((t) => t.title.toLowerCase().includes(match));
        if (!target) {
          return { ok: false, message: `I couldn't find a task matching "${call.args.titleMatch}".` };
        }
        await db.todos.update(target.id, {
          status: 'done',
          updatedAt: new Date().toISOString(),
        });
        return { ok: true, message: `Done — I've marked "${target.title}" as complete.` };
      }

      case 'save_clipboard': {
        const title = String(call.args.title ?? '').trim();
        if (!title) return { ok: false, message: 'What should I title this clipboard item?' };
        const now = new Date().toISOString();
        const item: ClipboardItem = {
          id: uuidv4(),
          planId: plan.id,
          type:
            typeof call.args.type === 'string'
              ? (call.args.type as ClipboardItem['type'])
              : 'Note',
          title,
          body: typeof call.args.body === 'string' ? call.args.body : undefined,
          createdAt: now,
          updatedAt: now,
        };
        await db.clipboard.add(item);
        return { ok: true, message: `Done — I've saved "${item.title}" to your clipboard.` };
      }

      default:
        return {
          ok: false,
          message: "I couldn't complete that action — try rephrasing.",
        };
    }
  } catch {
    return { ok: false, message: "I couldn't complete that action — try rephrasing." };
  }
}

/** Build the system prompt with plan context, date, active tab, itinerary summary. */
export function buildSystemPrompt(plan: Plan, activeTab: string): string {
  const today = new Date().toISOString().split('T')[0];
  const summary = plan.itinerary
    .map(
      (d) =>
        `Day ${d.dayIndex + 1} (index ${d.dayIndex}): ${d.activities
          .map((a) => `${a.time} ${a.name}`)
          .join('; ') || 'no activities'}`,
    )
    .join('\n');
  return [
    'You are Journ.ai, a travel-planning assistant embedded in the app.',
    'You can modify the current plan by calling the provided tools.',
    'Use dayIndex (0-based) when adding activities.',
    'If a request is ambiguous (e.g. "add something for tonight"), ask a clarifying question INSTEAD of guessing — do not call a tool.',
    'Only act on the plan the user is currently viewing.',
    `Today's date: ${today}`,
    `Active tab: ${activeTab}`,
    `Plan: ${plan.destination} (${plan.startDate} to ${plan.endDate})`,
    'Itinerary summary:',
    summary || '(no days yet)',
  ].join('\n');
}
