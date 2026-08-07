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
      name: 'remove_activity',
      description:
        'Remove an activity from the itinerary, found by a case-insensitive substring of its name. Optionally scope to a specific day.',
      parameters: {
        type: 'object',
        properties: {
          nameMatch: { type: 'string', description: 'Part of the activity name to match, e.g. "museum"' },
          dayIndex: { type: 'integer', description: 'Optional 0-based day to scope the search' },
        },
        required: ['nameMatch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_activity',
      description:
        'Change an existing activity, found by a case-insensitive substring of its current name. Use this to REPLACE one activity with another (set newName/locationName) or to change its time/notes. Only the fields you provide are changed; the rest are kept.',
      parameters: {
        type: 'object',
        properties: {
          nameMatch: { type: 'string', description: 'Part of the CURRENT activity name to find, e.g. "museum"' },
          dayIndex: { type: 'integer', description: 'Optional 0-based day to scope the search' },
          newName: { type: 'string', description: 'New activity name (for a replacement)' },
          time: { type: 'string', description: 'New HH:MM 24h time' },
          locationName: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['nameMatch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_activity',
      description:
        'Move an existing activity to a different day and/or a different time, keeping its name, location and notes. Found by a case-insensitive substring of its name.',
      parameters: {
        type: 'object',
        properties: {
          nameMatch: { type: 'string', description: 'Part of the activity name to find, e.g. "museum"' },
          toDayIndex: { type: 'integer', description: 'Destination 0-based day index' },
          fromDayIndex: { type: 'integer', description: 'Optional 0-based day to scope the search' },
          time: { type: 'string', description: 'Optional new HH:MM 24h time' },
        },
        required: ['nameMatch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_todo',
      description:
        'Create a new to-do task for the current plan, e.g. "book the train to Kyoto". Use this for anything the user needs to remember or arrange, as opposed to an itinerary activity that happens at a time and place.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: {
            type: 'string',
            enum: ['Booking', 'Document', 'Packing', 'Other'],
            description: 'Booking for reservations, Document for visas/insurance, Packing for what to bring',
          },
          dueDate: { type: 'string', description: 'Optional ISO date, e.g. 2025-07-10' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reopen_todo',
      description:
        'Mark a completed to-do task as not done again, by matching its title (case-insensitive substring). The opposite of complete_todo.',
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
      name: 'pin_activity_to_todo',
      description:
        'Create a to-do task linked to an existing itinerary activity, so the user can track booking or preparing for it. Found by a case-insensitive substring of the activity name.',
      parameters: {
        type: 'object',
        properties: {
          nameMatch: { type: 'string', description: 'Part of the activity name to find' },
          dayIndex: { type: 'integer', description: 'Optional 0-based day to scope the search' },
        },
        required: ['nameMatch'],
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
      name: 'find_activities',
      description:
        "Look up full details of itinerary activities — location and notes, which the summary above omits. Use this before answering questions about what an activity involves, or to check an activity's exact name before editing it.",
      parameters: {
        type: 'object',
        properties: {
          nameMatch: {
            type: 'string',
            description: 'Optional case-insensitive substring of the activity name; omit to list all',
          },
          dayIndex: { type: 'integer', description: 'Optional 0-based day to scope the search' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_clipboard_item',
      description:
        'Read the full saved text of a clipboard item — confirmation numbers, addresses, booking details. The list above shows only titles, so use this whenever the answer is inside a saved item.',
      parameters: {
        type: 'object',
        properties: {
          titleMatch: { type: 'string', description: 'Part of the clipboard item title to match' },
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

/**
 * `message` is what the user sees. `data` is set only by read tools: it is the
 * payload fed back to the model for the next turn, and its presence marks the
 * action as a lookup rather than a change — so useAgentChat knows not to show a
 * confirmation bubble for it and to let the model answer in its own words.
 */
export type AgentActionResult =
  | { ok: true; message: string; data?: string }
  | { ok: false; message: string; data?: string };

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

      case 'remove_activity': {
        const match = String(call.args.nameMatch ?? '').trim().toLowerCase();
        if (!match) return { ok: false, message: 'Which activity should I remove?' };
        const dayScope = call.args.dayIndex != null ? Number(call.args.dayIndex) : null;
        for (const d of plan.itinerary) {
          if (dayScope != null && d.dayIndex !== dayScope) continue;
          const act = d.activities.find((a) => a.name.toLowerCase().includes(match));
          if (act) {
            const itinerary = plan.itinerary.map((day) =>
              day.dayIndex === d.dayIndex
                ? { ...day, activities: day.activities.filter((a) => a.id !== act.id) }
                : day,
            );
            await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
            return { ok: true, message: `Done — I've removed "${act.name}" from Day ${d.dayIndex + 1}.` };
          }
        }
        return { ok: false, message: `I couldn't find an activity matching "${call.args.nameMatch}".` };
      }

      case 'edit_activity': {
        const match = String(call.args.nameMatch ?? '').trim().toLowerCase();
        if (!match) return { ok: false, message: 'Which activity should I change?' };
        const dayScope = call.args.dayIndex != null ? Number(call.args.dayIndex) : null;
        for (const d of plan.itinerary) {
          if (dayScope != null && d.dayIndex !== dayScope) continue;
          const act = d.activities.find((a) => a.name.toLowerCase().includes(match));
          if (act) {
            const newName =
              typeof call.args.newName === 'string' && call.args.newName.trim()
                ? call.args.newName.trim()
                : act.name;
            const updated: Activity = {
              ...act,
              name: newName,
              time: typeof call.args.time === 'string' ? call.args.time : act.time,
              locationName:
                typeof call.args.locationName === 'string' ? call.args.locationName : act.locationName,
              notes: typeof call.args.notes === 'string' ? call.args.notes : act.notes,
            };
            const itinerary = plan.itinerary.map((day) =>
              day.dayIndex === d.dayIndex
                ? { ...day, activities: day.activities.map((a) => (a.id === act.id ? updated : a)) }
                : day,
            );
            await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
            const changed = newName !== act.name ? ` to "${newName}"` : '';
            return { ok: true, message: `Done — I've updated "${act.name}"${changed} on Day ${d.dayIndex + 1}.` };
          }
        }
        return { ok: false, message: `I couldn't find an activity matching "${call.args.nameMatch}".` };
      }

      case 'move_activity': {
        const match = String(call.args.nameMatch ?? '').trim().toLowerCase();
        if (!match) return { ok: false, message: 'Which activity should I move?' };
        const fromScope =
          call.args.fromDayIndex != null ? Number(call.args.fromDayIndex) : null;
        const hasTarget = call.args.toDayIndex != null;
        const toDayIndex = hasTarget ? Number(call.args.toDayIndex) : null;
        const newTime = typeof call.args.time === 'string' ? call.args.time : null;
        if (!hasTarget && !newTime) {
          return { ok: false, message: 'Where should I move it — which day, or what time?' };
        }
        if (toDayIndex != null && !plan.itinerary.some((d) => d.dayIndex === toDayIndex)) {
          return { ok: false, message: `There is no Day ${toDayIndex + 1} in this plan.` };
        }
        for (const d of plan.itinerary) {
          if (fromScope != null && d.dayIndex !== fromScope) continue;
          const act = d.activities.find((a) => a.name.toLowerCase().includes(match));
          if (!act) continue;
          const dest = toDayIndex ?? d.dayIndex;
          const moved: Activity = { ...act, time: newTime ?? act.time };
          // Detach from the old day first, then append to the destination. When
          // dest === source this is a no-op removal followed by a re-add, which
          // also moves it to the end — harmless, the UI sorts by time.
          const itinerary = plan.itinerary.map((day) => {
            const without = day.activities.filter((a) => a.id !== act.id);
            if (day.dayIndex === dest) return { ...day, activities: [...without, moved] };
            return { ...day, activities: without };
          });
          await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
          const where = dest !== d.dayIndex ? ` to Day ${dest + 1}` : '';
          const when = newTime ? ` at ${newTime}` : '';
          return { ok: true, message: `Done — I've moved "${act.name}"${where}${when}.` };
        }
        return { ok: false, message: `I couldn't find an activity matching "${call.args.nameMatch}".` };
      }

      case 'add_todo': {
        const title = String(call.args.title ?? '').trim();
        if (!title) return { ok: false, message: 'What should the task be called?' };
        const allowed = ['Booking', 'Document', 'Packing', 'Other'] as const;
        const raw = String(call.args.category ?? '');
        const category = (allowed as readonly string[]).includes(raw)
          ? (raw as TodoItem['category'])
          : 'Other';
        const now = new Date().toISOString();
        const todo: TodoItem = {
          id: uuidv4(),
          planId: plan.id,
          title,
          category,
          status: 'todo',
          dueDate: typeof call.args.dueDate === 'string' ? call.args.dueDate : undefined,
          autoGenerated: false,
          createdAt: now,
          updatedAt: now,
        };
        await db.todos.add(todo);
        return { ok: true, message: `Done — I've added "${title}" to your ${category} to-dos.` };
      }

      case 'reopen_todo': {
        const match = String(call.args.titleMatch ?? '').trim().toLowerCase();
        if (!match) return { ok: false, message: 'Which task should I reopen?' };
        const todos: TodoItem[] = await db.todos.where('planId').equals(plan.id).toArray();
        const target = todos.find((t) => t.title.toLowerCase().includes(match));
        if (!target) {
          return { ok: false, message: `I couldn't find a task matching "${call.args.titleMatch}".` };
        }
        await db.todos.update(target.id, { status: 'todo', updatedAt: new Date().toISOString() });
        return { ok: true, message: `Done — I've reopened "${target.title}".` };
      }

      case 'pin_activity_to_todo': {
        const match = String(call.args.nameMatch ?? '').trim().toLowerCase();
        if (!match) return { ok: false, message: 'Which activity should I add a task for?' };
        const dayScope = call.args.dayIndex != null ? Number(call.args.dayIndex) : null;
        for (const d of plan.itinerary) {
          if (dayScope != null && d.dayIndex !== dayScope) continue;
          const act = d.activities.find((a) => a.name.toLowerCase().includes(match));
          if (!act) continue;
          // Don't create a duplicate task for an activity that already has one.
          const existing: TodoItem[] = await db.todos.where('planId').equals(plan.id).toArray();
          if (existing.some((t) => t.sourceActivityId === act.id)) {
            return { ok: false, message: `"${act.name}" is already on your to-do list.` };
          }
          const now = new Date().toISOString();
          await db.todos.add({
            id: uuidv4(),
            planId: plan.id,
            title: act.name,
            category: 'Booking',
            status: 'todo',
            autoGenerated: false,
            sourceActivityId: act.id,
            sourceDayIndex: d.dayIndex,
            createdAt: now,
            updatedAt: now,
          });
          const itinerary = plan.itinerary.map((day) =>
            day.dayIndex === d.dayIndex
              ? {
                  ...day,
                  activities: day.activities.map((a) =>
                    a.id === act.id ? { ...a, pinnedToTodo: true } : a,
                  ),
                }
              : day,
          );
          await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
          return { ok: true, message: `Done — I've added "${act.name}" to your to-do list.` };
        }
        return { ok: false, message: `I couldn't find an activity matching "${call.args.nameMatch}".` };
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

      case 'find_activities': {
        const match = String(call.args.nameMatch ?? '').trim().toLowerCase();
        const dayScope = call.args.dayIndex != null ? Number(call.args.dayIndex) : null;
        const hits: Record<string, unknown>[] = [];
        for (const d of plan.itinerary) {
          if (dayScope != null && d.dayIndex !== dayScope) continue;
          for (const a of d.activities) {
            if (match && !a.name.toLowerCase().includes(match)) continue;
            hits.push({
              day: d.dayIndex + 1,
              dayIndex: d.dayIndex,
              name: a.name,
              time: a.time,
              location: a.locationName || null,
              notes: a.notes || null,
              pinnedToTodo: a.pinnedToTodo,
            });
          }
        }
        return {
          ok: true,
          message: `Found ${hits.length} activit${hits.length === 1 ? 'y' : 'ies'}.`,
          data: JSON.stringify(hits),
        };
      }

      case 'read_clipboard_item': {
        const match = String(call.args.titleMatch ?? '').trim().toLowerCase();
        if (!match) return { ok: false, message: 'Which saved item should I look at?' };
        const items: ClipboardItem[] = await db.clipboard
          .where('planId')
          .equals(plan.id)
          .toArray();
        const hits = items
          .filter((c) => c.title.toLowerCase().includes(match))
          .map((c) => ({
            title: c.title,
            type: c.type,
            // Files have no text to read; say so rather than returning null and
            // letting the model guess the item is empty.
            body: c.body ?? (c.fileName ? `(file attachment: ${c.fileName})` : null),
            linkedDayIndex: c.linkedDayIndex ?? null,
          }));
        if (!hits.length) {
          return {
            ok: false,
            message: `I couldn't find a saved item matching "${call.args.titleMatch}".`,
            data: JSON.stringify([]),
          };
        }
        return {
          ok: true,
          message: `Read ${hits.length} saved item${hits.length === 1 ? '' : 's'}.`,
          data: JSON.stringify(hits),
        };
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

/**
 * Build the system prompt with plan context, date, active tab, and summaries of
 * the itinerary, to-dos and clipboard.
 *
 * The to-do and clipboard summaries exist because the agent loop is single-shot:
 * a tool call is executed and its confirmation is shown, with no second turn in
 * which the model could read a result. A `list_todos`-style tool would therefore
 * return data the model never sees, so anything it needs to ANSWER questions
 * about has to be in the prompt up front. Clipboard bodies are omitted — titles
 * and types are enough to answer "what have I saved?" without bloating context.
 */
export function buildSystemPrompt(
  plan: Plan,
  activeTab: string,
  context: { todos?: TodoItem[]; clipboard?: ClipboardItem[] } = {},
): string {
  const today = new Date().toISOString().split('T')[0];
  const summary = plan.itinerary
    .map(
      (d) =>
        `Day ${d.dayIndex + 1} (index ${d.dayIndex}): ${d.activities
          .map((a) => `${a.time} ${a.name}`)
          .join('; ') || 'no activities'}`,
    )
    .join('\n');
  const todoSummary = (context.todos ?? [])
    .map((t) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title} (${t.category})`)
    .join('\n');
  const clipboardSummary = (context.clipboard ?? [])
    .map((c) => `- ${c.title} (${c.type})`)
    .join('\n');
  return [
    'You are Journ.ai, a travel-planning assistant embedded in the app.',
    'You can modify the current plan by calling the provided tools: add, remove, edit or move activities; add, complete or reopen a to-do; add a to-do linked to an activity; or save a clipboard note.',
    'Choose between an activity and a to-do by what the user is describing: an ACTIVITY is something they do at a time and place on a specific day (use add_activity); a TO-DO is something to arrange or remember beforehand, with no slot in the day (use add_todo). "Book the train" is a to-do; "take the 9am train to Kyoto" is an activity.',
    'Use move_activity to change which day or time an existing activity sits at — do not remove and re-add it, which loses its notes and location.',
    'Use pin_activity_to_todo when the user wants to track booking or preparing for something already in the itinerary.',
    'The to-do and clipboard lists below are the current state — use them to answer questions directly rather than calling a tool.',
    'For detail they do NOT contain — an activity\'s location or notes, or the saved text inside a clipboard item — call find_activities or read_clipboard_item first, then answer from what comes back. You will get the results and a turn to reply.',
    'To REPLACE one activity with another (e.g. "swap the museum for the aquarium"), call edit_activity with nameMatch set to the current activity and newName (and locationName) set to the replacement — this keeps its time slot. Use remove_activity only when the user wants it gone with nothing in its place.',
    'Match existing activities by a distinctive part of their name (nameMatch is a case-insensitive substring). Use dayIndex (0-based, shown in the itinerary summary) when adding, or to disambiguate if the same name appears on multiple days.',
    'If a request is ambiguous (e.g. "add something for tonight"), ask a clarifying question INSTEAD of guessing — do not call a tool.',
    'Only act on the plan the user is currently viewing.',
    `Today's date: ${today}`,
    `Active tab: ${activeTab}`,
    `Plan: ${plan.destination} (${plan.startDate} to ${plan.endDate})`,
    'Itinerary summary:',
    summary || '(no days yet)',
    'To-do list:',
    todoSummary || '(no tasks yet)',
    'Clipboard items:',
    clipboardSummary || '(nothing saved yet)',
  ].join('\n');
}
