import { v4 as uuidv4 } from 'uuid';
import {
  db,
  type Plan,
  type Activity,
  type ClipboardItem,
  type TodoItem,
  type TravelMode,
  type TripLeg,
  type TripStop,
} from '../../db';
import { TRAVEL_MODES, describeLeg, tripRoute } from '../../utils/travel';
import { fitDaysToDates } from '../../utils/fitDays';
import { MAX_TRIP_DAYS_ERROR, exceedsMaxTripDays } from '../../utils/tripDuration';
import { dateForDayIndex } from '../../utils/tripDay';
import { shortDate } from '../../utils/dateText';
import { sortByTime } from '../../utils/activityTime';
import {
  activityRef,
  describeTime,
  findDuplicate,
  nextSlot,
  normalizeName,
  normalizeTime,
  placeInDay,
  resolveActivity,
  resolutionError,
} from './planOps';

/** Accepted values for the mode argument, straight from the shared list. */
const TRAVEL_MODE_IDS: string[] = TRAVEL_MODES.map((m) => m.id);

/*
 * How the model names an activity: its ref (shown beside it in the itinerary
 * summary) is exact; a name is matched forgivingly and refused when it fits
 * more than one, so the model asks or adds the day instead of guessing.
 */
const ACTIVITY_TARGET = {
  ref: { type: 'string', description: 'The activity ref from the itinerary summary, e.g. "a1b2c3". Preferred: it is exact.' },
  nameMatch: { type: 'string', description: 'Or part of the activity name, e.g. "museum", when you have no ref' },
  dayIndex: { type: 'integer', description: 'Optional 0-based day, to narrow a name match' },
} as const;

const TIME_ARG = {
  type: 'string',
  description: 'Part of the day: "morning", "noon" (afternoon), "evening" or "night". Use a 24h HH:MM time only for something genuinely fixed (a booking, a show, a train).',
} as const;

const PLACEMENT = {
  position: { type: 'string', enum: ['first', 'last'], description: 'Optional: first or last within its part of the day' },
  before: { type: 'string', description: 'Optional ref of an activity on that day to place it just before' },
  after: { type: 'string', description: 'Optional ref of an activity on that day to place it just after' },
} as const;

/**
 * Tool definitions exposed to the AI provider. The model returns one of these
 * as a tool call; executeAgentAction applies it to IndexedDB.
 */
export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_activity',
      description:
        'Add a new activity to a day. It is placed where it belongs in the day (by part of day, then time). Refused if the same activity is already in the trip, unless allowRepeat is set for something that genuinely recurs (breakfast, a hotel pool).',
      parameters: {
        type: 'object',
        properties: {
          dayIndex: { type: 'integer', description: '0-based day index' },
          name: { type: 'string', description: 'A real, specific place or thing to do' },
          time: TIME_ARG,
          locationName: { type: 'string', description: 'Where it is, with the city, so it reaches the map' },
          notes: { type: 'string' },
          ...PLACEMENT,
          allowRepeat: { type: 'boolean', description: 'Only for things that genuinely recur on several days' },
        },
        required: ['dayIndex', 'name', 'time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_activity',
      description: 'Remove an activity, with nothing in its place.',
      parameters: { type: 'object', properties: { ...ACTIVITY_TARGET } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_activity',
      description:
        'Change an existing activity in place: rename or REPLACE it with another (newName, locationName), or change its time or notes. Only the fields you give change.',
      parameters: {
        type: 'object',
        properties: {
          ...ACTIVITY_TARGET,
          newName: { type: 'string', description: 'New name, for a replacement' },
          time: TIME_ARG,
          locationName: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_activity',
      description:
        'Move an existing activity to another day and/or part of the day, or reorder it within its day ("put the museum first", "move lunch after the temple"). Keeps its name, location and notes.',
      parameters: {
        type: 'object',
        properties: {
          ...ACTIVITY_TARGET,
          toDayIndex: { type: 'integer', description: 'Destination 0-based day; omit to stay on the same day' },
          time: TIME_ARG,
          ...PLACEMENT,
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'swap_activities',
      description:
        'Swap two activities: each takes the other one\'s day, part of the day and place in it. Use for "swap X on day 1 with Y on day 2" or "swap the order of X and Y".',
      parameters: {
        type: 'object',
        properties: {
          refA: { type: 'string' },
          nameA: { type: 'string', description: 'Or part of the first activity name' },
          dayA: { type: 'integer', description: 'Optional 0-based day of the first' },
          refB: { type: 'string' },
          nameB: { type: 'string', description: 'Or part of the second activity name' },
          dayB: { type: 'integer', description: 'Optional 0-based day of the second' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_day',
      description: 'Give a day a theme, e.g. "Temples and gardens". The day number and date are kept.',
      parameters: {
        type: 'object',
        properties: {
          dayIndex: { type: 'integer' },
          theme: { type: 'string', description: 'A short theme; empty to go back to the date' },
        },
        required: ['dayIndex', 'theme'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_trip_dates',
      description:
        'Change the trip start and/or end date. Days are added to or removed from the end to match. If that would remove days that have activities, the change is refused unless confirmRemoval is true; ask the user first.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'ISO date, e.g. 2026-11-07' },
          endDate: { type: 'string', description: 'ISO date' },
          confirmRemoval: { type: 'boolean', description: 'Only after the user agreed to lose those days' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_todo',
      description: 'Change a to-do: its title, category or due date.',
      parameters: {
        type: 'object',
        properties: {
          titleMatch: { type: 'string', description: 'Part of the current title' },
          newTitle: { type: 'string' },
          category: { type: 'string', enum: ['Booking', 'Document', 'Packing', 'Other'] },
          dueDate: { type: 'string', description: 'ISO date, or empty to clear' },
        },
        required: ['titleMatch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_todo',
      description: 'Delete a to-do the user no longer wants. For one that is finished, use complete_todo instead.',
      parameters: {
        type: 'object',
        properties: { titleMatch: { type: 'string', description: 'Part of the title' } },
        required: ['titleMatch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'link_clipboard_item',
      description:
        'File a saved item (boarding pass, hotel email) under a day, optionally beside an activity and at a time; or unlink it with dayIndex -1.',
      parameters: {
        type: 'object',
        properties: {
          titleMatch: { type: 'string', description: 'Part of the saved item title' },
          dayIndex: { type: 'integer', description: '0-based day, or -1 to unlink' },
          activityRef: { type: 'string', description: 'Optional ref of the activity it belongs to' },
          time: TIME_ARG,
        },
        required: ['titleMatch', 'dayIndex'],
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
        'Create a to-do task linked to an existing itinerary activity, so the user can track booking or preparing for it.',
      parameters: { type: 'object', properties: { ...ACTIVITY_TARGET } },
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
        "Look up full details of itinerary activities: notes and address, which the summary omits. Use this before answering questions about what an activity involves.",
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
      name: 'set_travel_leg',
      description:
        "Record how and where the trip begins or ends — the city the traveller sets off from or returns to, and how they are travelling. Use this when they say something like \"we're driving up from Montreal\" or \"we fly home from Osaka on the 20th\". This is what tells the itinerary which end of the route the trip starts at; without it a road trip is planned from its furthest point.",
      parameters: {
        type: 'object',
        properties: {
          which: { type: 'string', enum: ['arrival', 'departure'], description: 'arrival = setting off / getting there; departure = heading home' },
          city: { type: 'string', description: 'The city they leave from or return to, e.g. "Montreal"' },
          mode: { type: 'string', enum: ['flight', 'train', 'bus', 'car', 'ferry', 'other'] },
          date: { type: 'string', description: 'Optional ISO date, e.g. 2025-08-01' },
          time: { type: 'string', description: 'Optional 24h clock time, e.g. 22:40' },
        },
        required: ['which'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_trip_stops',
      description:
        'Set the cities the trip passes through, IN THE ORDER THEY ARE VISITED. This REPLACES the whole list, so include every city, not just a new one. Use it when the user describes or corrects their route. Do not include the city they set off from — that is set_travel_leg.',
      parameters: {
        type: 'object',
        properties: {
          stops: {
            type: 'array',
            description: 'Cities in visit order',
            items: {
              type: 'object',
              properties: {
                city: { type: 'string' },
                nights: { type: 'number', description: 'Optional nights spent here' },
              },
              required: ['city'],
            },
          },
        },
        required: ['stops'],
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

/** Where to put an activity in a day, from the tool's position/before/after. */
function placement(activities: Activity[], args: Record<string, unknown>) {
  const find = (v: unknown) =>
    typeof v === 'string' ? activities.find((a) => activityRef(a) === v.replace(/^\[|\]$/g, '').toLowerCase()) : undefined;
  return {
    position: args.position === 'first' || args.position === 'last' ? args.position : undefined,
    before: find(args.before),
    after: find(args.after),
  };
}

/** Saved items filed under a moved activity follow it to its new day. */
async function relinkClipboard(planId: string, dayFor: Record<string, number>) {
  const items: ClipboardItem[] = await db.clipboard.where('planId').equals(planId).toArray();
  for (const c of items) {
    if (c.linkedActivityId && dayFor[c.linkedActivityId] !== undefined) {
      await db.clipboard.update(c.id, { linkedDayIndex: dayFor[c.linkedActivityId], updatedAt: new Date().toISOString() });
    }
  }
}

/** One to-do by part of its title; more than one match is said, not guessed. */
async function findTodo(planId: string, titleMatch: unknown): Promise<{ todo: TodoItem } | { error: string }> {
  const want = normalizeName(String(titleMatch ?? ''));
  if (!want) return { error: 'Which task?' };
  const todos: TodoItem[] = await db.todos.where('planId').equals(planId).toArray();
  const exact = todos.filter((t) => normalizeName(t.title) === want);
  const hits = exact.length ? exact : todos.filter((t) => normalizeName(t.title).includes(want));
  if (hits.length === 1) return { todo: hits[0] };
  if (hits.length > 1) return { error: `More than one task matches "${String(titleMatch)}": ${hits.map((t) => `"${t.title}"`).join(', ')}. Which one?` };
  return { error: `I couldn't find a task matching "${String(titleMatch)}".` };
}

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
        // Already in the trip: say where, rather than adding it twice. Things
        // that genuinely recur ask for it with allowRepeat.
        const dup = call.args.allowRepeat === true ? null : findDuplicate(plan, name);
        if (dup) {
          return {
            ok: false,
            message: `"${dup.activity.name}" is already on Day ${dup.dayIndex + 1} (${describeTime(dup.activity.time)}), so I didn't add it again.`,
          };
        }
        const time = normalizeTime(call.args.time) ?? nextSlot(day.activities);
        const activity: Activity = {
          id: uuidv4(),
          name,
          time,
          locationName:
            typeof call.args.locationName === 'string' ? call.args.locationName : '',
          notes: typeof call.args.notes === 'string' ? call.args.notes : '',
          pinnedToTodo: false,
        };
        const placed = placeInDay(day.activities, activity, placement(day.activities, call.args));
        const itinerary = plan.itinerary.map((d) =>
          d.dayIndex === dayIndex ? { ...d, activities: placed } : d,
        );
        await db.plans.update(plan.id, {
          itinerary,
          updatedAt: new Date().toISOString(),
        });
        return {
          ok: true,
          message: `Done — I've added ${activity.name} to Day ${dayIndex + 1}, ${describeTime(activity.time)}.`,
        };
      }

      case 'remove_activity': {
        const r = resolveActivity(plan, call.args);
        if (r.kind !== 'found') {
          if (!call.args.ref && !call.args.nameMatch) return { ok: false, message: 'Which activity should I remove?' };
          return { ok: false, message: resolutionError(r, call.args.nameMatch ?? call.args.ref) };
        }
        const { dayIndex, activity: act } = r.hit;
        const itinerary = plan.itinerary.map((day) =>
          day.dayIndex === dayIndex
            ? { ...day, activities: day.activities.filter((a) => a.id !== act.id) }
            : day,
        );
        await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
        return { ok: true, message: `Done — I've removed "${act.name}" from Day ${dayIndex + 1}.` };
      }

      case 'edit_activity': {
        const r = resolveActivity(plan, call.args);
        if (r.kind !== 'found') {
          if (!call.args.ref && !call.args.nameMatch) return { ok: false, message: 'Which activity should I change?' };
          return { ok: false, message: resolutionError(r, call.args.nameMatch ?? call.args.ref) };
        }
        const { dayIndex, activity: act } = r.hit;
        const newName =
          typeof call.args.newName === 'string' && call.args.newName.trim()
            ? call.args.newName.trim()
            : act.name;
        // A replacement must not become a second copy of something elsewhere.
        if (newName !== act.name) {
          const dup = findDuplicate(plan, newName);
          if (dup && dup.activity.id !== act.id) {
            return { ok: false, message: `"${dup.activity.name}" is already on Day ${dup.dayIndex + 1}, so I didn't make a second one.` };
          }
        }
        const time = call.args.time !== undefined ? normalizeTime(call.args.time) : null;
        if (call.args.time !== undefined && !time) {
          return { ok: false, message: `I didn't understand the time "${String(call.args.time)}".` };
        }
        const updated: Activity = {
          ...act,
          name: newName,
          time: time ?? act.time,
          locationName:
            typeof call.args.locationName === 'string' ? call.args.locationName : act.locationName,
          notes: typeof call.args.notes === 'string' ? call.args.notes : act.notes,
          // A new place needs looking up again.
          ...(typeof call.args.locationName === 'string' || newName !== act.name
            ? { coordinates: undefined, address: undefined, locationUnresolved: undefined, about: undefined }
            : {}),
        };
        const itinerary = plan.itinerary.map((day) => {
          if (day.dayIndex !== dayIndex) return day;
          // A new part of the day puts it among that part's activities.
          const activities = time
            ? placeInDay(day.activities, updated)
            : day.activities.map((a) => (a.id === act.id ? updated : a));
          return { ...day, activities };
        });
        await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
        const changed = newName !== act.name ? ` to "${newName}"` : '';
        const when = time ? `, ${describeTime(time)}` : '';
        return { ok: true, message: `Done — I've updated "${act.name}"${changed} on Day ${dayIndex + 1}${when}.` };
      }

      case 'move_activity': {
        const r = resolveActivity(plan, { ...call.args, dayIndex: call.args.dayIndex ?? call.args.fromDayIndex });
        if (r.kind !== 'found') {
          if (!call.args.ref && !call.args.nameMatch) return { ok: false, message: 'Which activity should I move?' };
          return { ok: false, message: resolutionError(r, call.args.nameMatch ?? call.args.ref) };
        }
        const { dayIndex: from, activity: act } = r.hit;
        const hasTarget = call.args.toDayIndex != null;
        const dest = hasTarget ? Number(call.args.toDayIndex) : from;
        const newTime = call.args.time !== undefined ? normalizeTime(call.args.time) : null;
        const hasPlacement = call.args.position != null || call.args.before != null || call.args.after != null;
        if (!hasTarget && !newTime && !hasPlacement) {
          return { ok: false, message: 'Where should I move it — which day, what part of the day, or before or after what?' };
        }
        if (call.args.time !== undefined && !newTime) {
          return { ok: false, message: `I didn't understand the time "${String(call.args.time)}".` };
        }
        const destDay = plan.itinerary.find((d) => d.dayIndex === dest);
        if (!destDay) {
          return { ok: false, message: `There is no Day ${dest + 1} in this plan.` };
        }
        const moved: Activity = { ...act, time: newTime ?? act.time };
        const itinerary = plan.itinerary.map((day) => {
          const without = day.activities.filter((a) => a.id !== act.id);
          if (day.dayIndex === dest) {
            return { ...day, activities: placeInDay(without, moved, placement(without, call.args)) };
          }
          return { ...day, activities: without };
        });
        await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
        if (dest !== from) await relinkClipboard(plan.id, { [act.id]: dest });
        const final = itinerary.find((d) => d.dayIndex === dest)!.activities.find((a) => a.id === act.id)!;
        const where = dest !== from ? ` to Day ${dest + 1}` : '';
        return { ok: true, message: `Done — I've moved "${act.name}"${where}, ${describeTime(final.time)}.` };
      }

      case 'swap_activities': {
        const a = resolveActivity(plan, { ref: call.args.refA, nameMatch: call.args.nameA, dayIndex: call.args.dayA });
        const b = resolveActivity(plan, { ref: call.args.refB, nameMatch: call.args.nameB, dayIndex: call.args.dayB });
        if (a.kind !== 'found') return { ok: false, message: resolutionError(a, call.args.nameA ?? call.args.refA) };
        if (b.kind !== 'found') return { ok: false, message: resolutionError(b, call.args.nameB ?? call.args.refB) };
        const A = a.hit;
        const B = b.hit;
        if (A.activity.id === B.activity.id) return { ok: false, message: 'Those are the same activity.' };
        // Each takes the other's place: its day, its time, its spot in the list.
        const aNew: Activity = { ...A.activity, time: B.activity.time };
        const bNew: Activity = { ...B.activity, time: A.activity.time };
        const itinerary = plan.itinerary.map((day) => ({
          ...day,
          activities: day.activities.map((x) => (x.id === A.activity.id ? bNew : x.id === B.activity.id ? aNew : x)),
        }));
        await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
        if (A.dayIndex !== B.dayIndex) {
          await relinkClipboard(plan.id, { [A.activity.id]: B.dayIndex, [B.activity.id]: A.dayIndex });
        }
        return {
          ok: true,
          message: `Done — I've swapped them: "${A.activity.name}" is now on Day ${B.dayIndex + 1} (${describeTime(aNew.time)}), and "${B.activity.name}" on Day ${A.dayIndex + 1} (${describeTime(bNew.time)}).`,
        };
      }

      case 'rename_day': {
        const dayIndex = Number(call.args.dayIndex);
        const day = plan.itinerary.find((d) => d.dayIndex === dayIndex);
        if (!day) return { ok: false, message: `There is no Day ${dayIndex + 1} in this plan.` };
        const theme = String(call.args.theme ?? '').trim();
        const dated = fitDaysToDates(plan.itinerary, plan.startDate, plan.endDate).days[dayIndex]?.label;
        const plain = /^Day \d+( — \w{3} \d{1,2} \w{3})?$/.test(day.label) ? day.label : `Day ${dayIndex + 1}`;
        const label = theme ? `Day ${dayIndex + 1} — ${theme}` : dated ?? plain;
        const itinerary = plan.itinerary.map((d) => (d.dayIndex === dayIndex ? { ...d, label } : d));
        await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
        return { ok: true, message: `Done — Day ${dayIndex + 1} is now "${label}".` };
      }

      case 'set_trip_dates': {
        const iso = /^\d{4}-\d{2}-\d{2}$/;
        const start = typeof call.args.startDate === 'string' && iso.test(call.args.startDate) ? call.args.startDate : plan.startDate;
        const end = typeof call.args.endDate === 'string' && iso.test(call.args.endDate) ? call.args.endDate : plan.endDate;
        if (start === plan.startDate && end === plan.endDate) {
          return { ok: false, message: 'Which dates? I need a start or end date as YYYY-MM-DD.' };
        }
        if (end < start) return { ok: false, message: 'The end date has to be on or after the start date.' };
        if (exceedsMaxTripDays(start, end)) return { ok: false, message: MAX_TRIP_DAYS_ERROR };
        const fit = plan.itinerary.length ? fitDaysToDates(plan.itinerary, start, end) : { days: plan.itinerary, removed: [] };
        const lost = fit.removed.filter((d) => d.activities.length > 0);
        if (lost.length && call.args.confirmRemoval !== true) {
          const stops = lost.reduce((n, d) => n + d.activities.length, 0);
          return {
            ok: false,
            message: `Those dates would remove ${lost.map((d) => `Day ${d.dayIndex + 1}`).join(' and ')}, with ${stops} ${stops === 1 ? 'stop' : 'stops'}. Should I go ahead?`,
          };
        }
        await db.plans.update(plan.id, { startDate: start, endDate: end, itinerary: fit.days, updatedAt: new Date().toISOString() });
        const added = fit.days.length - Math.min(plan.itinerary.length, fit.days.length);
        const change = fit.removed.length
          ? `, and removed ${fit.removed.length} ${fit.removed.length === 1 ? 'day' : 'days'} from the end`
          : added > 0 ? `, and added ${added} empty ${added === 1 ? 'day' : 'days'}` : '';
        return { ok: true, message: `Done — the trip now runs ${start} to ${end}${change}.` };
      }

      case 'set_travel_leg': {
        const which = call.args.which === 'departure' ? 'departure' : 'arrival';
        const city = typeof call.args.city === 'string' ? call.args.city.trim() : '';
        const mode = TRAVEL_MODE_IDS.includes(String(call.args.mode))
          ? (String(call.args.mode) as TravelMode)
          : undefined;
        const date = typeof call.args.date === 'string' ? call.args.date.trim() : '';
        const time = typeof call.args.time === 'string' ? call.args.time.trim() : '';
        if (!city && !mode && !date && !time) {
          return { ok: false, message: 'What should I record — which city, and how are you travelling?' };
        }

        // Merged, not replaced: told the mode now and the city later, the
        // second answer should not erase the first.
        const leg: TripLeg = {
          ...(plan[which] ?? {}),
          ...(city ? { city } : {}),
          ...(mode ? { mode } : {}),
          ...(date ? { date } : {}),
          ...(time ? { time } : {}),
        };
        await db.plans.update(plan.id, { [which]: leg, updatedAt: new Date().toISOString() });

        const said = describeLeg(leg, plan.destination) ?? city;
        const verb = which === 'arrival' ? 'starts' : 'ends';
        return {
          ok: true,
          message: `Noted — the trip ${verb} with ${said}. Regenerate the itinerary to plan it in that order.`,
        };
      }

      case 'set_trip_stops': {
        const raw = Array.isArray(call.args.stops) ? call.args.stops : null;
        if (!raw) return { ok: false, message: 'Which cities, and in what order?' };

        const stops: TripStop[] = [];
        for (const entry of raw) {
          const item = entry as { city?: unknown; nights?: unknown };
          const city = typeof item.city === 'string' ? item.city.trim() : '';
          if (!city) continue;
          const nights = Number(item.nights);
          stops.push({
            id: uuidv4(),
            city,
            ...(Number.isFinite(nights) && nights > 0 ? { nights } : {}),
          });
        }
        if (!stops.length) return { ok: false, message: 'I did not catch any city names there.' };

        await db.plans.update(plan.id, { stops, updatedAt: new Date().toISOString() });
        const route = tripRoute({ ...plan, stops });
        return {
          ok: true,
          message: `Noted — the route is now ${route.join(' \u2192 ')}. Regenerate the itinerary to plan it in that order.`,
        };
      }

      case 'add_todo': {
        const title = String(call.args.title ?? '').trim();
        if (!title) return { ok: false, message: 'What should the task be called?' };
        const existing: TodoItem[] = await db.todos.where('planId').equals(plan.id).toArray();
        const same = existing.find((t) => normalizeName(t.title) === normalizeName(title));
        if (same) {
          return { ok: false, message: `"${same.title}" is already on your to-do list${same.status === 'done' ? ', ticked off' : ''}, so I didn't add it again.` };
        }
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
        if (!String(call.args.titleMatch ?? '').trim()) return { ok: false, message: 'Which task should I reopen?' };
        const found = await findTodo(plan.id, call.args.titleMatch);
        if ('error' in found) return { ok: false, message: found.error };
        const target = found.todo;
        await db.todos.update(target.id, { status: 'todo', updatedAt: new Date().toISOString() });
        return { ok: true, message: `Done — I've reopened "${target.title}".` };
      }

      case 'pin_activity_to_todo': {
        const r = resolveActivity(plan, call.args);
        if (r.kind !== 'found') {
          if (!call.args.ref && !call.args.nameMatch) return { ok: false, message: 'Which activity should I add a task for?' };
          return { ok: false, message: resolutionError(r, call.args.nameMatch ?? call.args.ref) };
        }
        const { dayIndex, activity: act } = r.hit;
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
          sourceDayIndex: dayIndex,
          createdAt: now,
          updatedAt: now,
        });
        const itinerary = plan.itinerary.map((day) =>
          day.dayIndex === dayIndex
            ? { ...day, activities: day.activities.map((a) => (a.id === act.id ? { ...a, pinnedToTodo: true } : a)) }
            : day,
        );
        await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
        return { ok: true, message: `Done — I've added "${act.name}" to your to-do list.` };
      }

      case 'edit_todo': {
        const found = await findTodo(plan.id, call.args.titleMatch);
        if ('error' in found) return { ok: false, message: found.error };
        const allowed = ['Booking', 'Document', 'Packing', 'Other'];
        const patch: Partial<TodoItem> = { updatedAt: new Date().toISOString() };
        if (typeof call.args.newTitle === 'string' && call.args.newTitle.trim()) patch.title = call.args.newTitle.trim();
        if (typeof call.args.category === 'string' && allowed.includes(call.args.category)) patch.category = call.args.category as TodoItem['category'];
        if (typeof call.args.dueDate === 'string') patch.dueDate = call.args.dueDate.trim() || undefined;
        if (Object.keys(patch).length === 1) return { ok: false, message: 'What should I change about it?' };
        await db.todos.update(found.todo.id, patch);
        return { ok: true, message: `Done — I've updated "${patch.title ?? found.todo.title}".` };
      }

      case 'remove_todo': {
        const found = await findTodo(plan.id, call.args.titleMatch);
        if ('error' in found) return { ok: false, message: found.error };
        await db.todos.delete(found.todo.id);
        return { ok: true, message: `Done — I've removed "${found.todo.title}" from your to-dos.` };
      }

      case 'link_clipboard_item': {
        const want = normalizeName(String(call.args.titleMatch ?? ''));
        if (!want) return { ok: false, message: 'Which saved item?' };
        const items: ClipboardItem[] = await db.clipboard.where('planId').equals(plan.id).toArray();
        const hits = items.filter((c) => normalizeName(c.title).includes(want));
        if (hits.length !== 1) {
          return {
            ok: false,
            message: hits.length
              ? `More than one saved item matches: ${hits.map((c) => `"${c.title}"`).join(', ')}. Which one?`
              : `I couldn't find a saved item matching "${String(call.args.titleMatch)}".`,
          };
        }
        const item = hits[0];
        const dayIndex = Number(call.args.dayIndex);
        if (dayIndex < 0) {
          await db.clipboard.update(item.id, { linkedDayIndex: undefined, linkedActivityId: undefined, updatedAt: new Date().toISOString() });
          return { ok: true, message: `Done — "${item.title}" is no longer filed under a day.` };
        }
        const day = plan.itinerary.find((d) => d.dayIndex === dayIndex);
        if (!day) return { ok: false, message: `There is no Day ${dayIndex + 1} in this plan.` };
        const act = typeof call.args.activityRef === 'string'
          ? day.activities.find((a) => activityRef(a) === String(call.args.activityRef).replace(/^\[|\]$/g, '').toLowerCase())
          : undefined;
        const time = normalizeTime(call.args.time);
        await db.clipboard.update(item.id, {
          linkedDayIndex: dayIndex,
          linkedActivityId: act?.id,
          ...(time ? { time } : {}),
          updatedAt: new Date().toISOString(),
        });
        return { ok: true, message: `Done — "${item.title}" is filed under Day ${dayIndex + 1}${act ? `, with ${act.name}` : ''}.` };
      }

      case 'complete_todo': {
        if (!String(call.args.titleMatch ?? '').trim()) return { ok: false, message: 'Which task should I mark as done?' };
        const found = await findTodo(plan.id, call.args.titleMatch);
        if ('error' in found) return { ok: false, message: found.error };
        const target = found.todo;
        await db.todos.update(target.id, {
          status: 'done',
          updatedAt: new Date().toISOString(),
        });
        return { ok: true, message: `Done — I've marked "${target.title}" as complete.` };
      }

      case 'find_activities': {
        const words = normalizeName(String(call.args.nameMatch ?? '')).split(' ').filter(Boolean);
        const dayScope = call.args.dayIndex != null ? Number(call.args.dayIndex) : null;
        const hits: Record<string, unknown>[] = [];
        for (const d of plan.itinerary) {
          if (dayScope != null && d.dayIndex !== dayScope) continue;
          for (const a of sortByTime(d.activities)) {
            const hay = normalizeName(`${a.name} ${a.locationName}`);
            if (words.length && !words.every((w) => hay.includes(w))) continue;
            hits.push({
              ref: activityRef(a),
              day: d.dayIndex + 1,
              dayIndex: d.dayIndex,
              name: a.name,
              time: describeTime(a.time),
              location: a.locationName || null,
              address: a.address || null,
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
/** What the assistant needs to know about the shape of the journey. */
function routeLines(plan: Plan): string[] {
  const lines: string[] = [];
  const route = tripRoute(plan);
  if (route.length > 1) lines.push(`Route, in visit order: ${route.join(' \u2192 ')}`);

  const arrival = describeLeg(plan.arrival, plan.destination);
  lines.push(
    arrival
      ? `Getting there: ${arrival}`
      : 'Getting there: not recorded — if the user says where they set off from, call set_travel_leg so the itinerary can be planned in the right order.',
  );
  const departure = describeLeg(plan.departure, plan.destination);
  if (departure) lines.push(`Heading home: ${departure}`);
  return lines;
}

export function buildSystemPrompt(
  plan: Plan,
  activeTab: string,
  context: { todos?: TodoItem[]; clipboard?: ClipboardItem[] } = {},
): string {
  const today = new Date().toISOString().split('T')[0];
  /*
   * Each day with its date and each activity as the day shows it: in order,
   * with its part of the day, any fixed time, where it is, and a ref the tools
   * take. It used to be "09:00 Museum; 12:00 Lunch" — no part of the day, no
   * place, and nothing to tell two museums apart but the order they came in.
   */
  const summary = plan.itinerary
    .map((d) => {
      const date = shortDate(dateForDayIndex(plan.startDate, d.dayIndex));
      const head = `Day ${d.dayIndex + 1} (dayIndex ${d.dayIndex})${date ? `, ${date}` : ''} — ${d.label}`;
      const acts = sortByTime(d.activities).map(
        (a) => `  [${activityRef(a)}] ${describeTime(a.time)}: ${a.name}${a.locationName ? ` @ ${a.locationName}` : ''}${a.pinnedToTodo ? ' (on to-do list)' : ''}`,
      );
      return [head, ...(acts.length ? acts : ['  (nothing planned)'])].join('\n');
    })
    .join('\n');
  const todoSummary = (context.todos ?? [])
    .map((t) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title} (${t.category})`)
    .join('\n');
  const clipboardSummary = (context.clipboard ?? [])
    .map((c) => `- ${c.title} (${c.type})`)
    .join('\n');
  return [
    'You are Journ.ai, a travel-planning assistant embedded in the app.',
    'You can change the current plan with the provided tools: add, edit, move, reorder, swap or remove activities; theme a day; change the trip dates and route; add, edit, complete, reopen or remove to-dos; save notes and file saved items under a day.',
    'You are a planner, not a chat partner. When asked to add, fill or improve part of the trip, decide the specifics yourself and make the change with a tool in the same turn. Then say what you changed, briefly.',
    'Choose between an activity and a to-do by what the user is describing: an ACTIVITY is something they do at a time and place on a specific day (use add_activity); a TO-DO is something to arrange or remember beforehand, with no slot in the day (use add_todo). "Book the train" is a to-do; "take the 9am train to Kyoto" is an activity.',
    'Use move_activity to change which day or time an existing activity sits at, or to reorder it within its day — do not remove and re-add it, which loses its notes and location.',
    /*
     * The tools take refs. Names are a fallback, and a name that fits two
     * activities is refused rather than guessed — which is what made a swap
     * across two days move the wrong one.
     */
    'Every activity in the itinerary summary has a ref in square brackets, e.g. [a1b2c3]. Pass it as ref (or refA/refB, before/after) to name an activity exactly. Use nameMatch only when the user names something you cannot find a ref for. If a tool says more than one activity matches, retry with the ref of the one meant, or ask which one if you cannot tell.',
    'To swap two activities ("swap the museum on day 1 with the market on day 2", "swap their order"), call swap_activities once with both refs: each takes the other one\'s day, part of the day and place. Do not do it as two moves.',
    /*
     * The day is planned in parts — Morning, Noon, Evening, Night — not clock
     * times. Asked for something "in the morning", the model used to invent
     * 09:00 and the activity was appended after the day's others.
     */
    'Time works in parts of the day: morning (5am–12pm), noon (12–5pm, i.e. the afternoon), evening (5–9pm) and night. Pass time as "morning", "noon", "evening" or "night" unless something is genuinely fixed — a booking, a show, a train — then use 24h HH:MM. The app places an activity among its part of the day for you; use position "first"/"last", or before/after a ref, when the user says where ("first thing", "before lunch", "after the temple").',
    'Never add something that is already in the trip: check the summary first. add_activity and add_todo refuse duplicates and say where the existing one is; tell the user that rather than trying again. Only set allowRepeat for things that genuinely recur on several days (breakfast at the hotel).',
    'When a request needs several changes ("swap these and add lunch"), make all of them in the same turn, one tool call each.',
    'Use set_trip_dates to change the trip dates; it adds or removes days at the end. If it says days with activities would be removed, ask the user before calling it again with confirmRemoval.',
    'Use pin_activity_to_todo when the user wants to track booking or preparing for something already in the itinerary.',
    'The destination is what the trip is ABOUT, not necessarily where it starts. If the user says they set off from somewhere else — "we drive up from Montreal" — record it with set_travel_leg rather than adding an activity for it, or the next generated itinerary will still start at the far end. Use set_trip_stops to set or correct the cities in between, in visit order.',
    'The to-do and clipboard lists below are the current state — use them to answer questions directly rather than calling a tool.',
    'For detail they do NOT contain — an activity\'s location or notes, or the saved text inside a clipboard item — call find_activities or read_clipboard_item first, then answer from what comes back. You will get the results and a turn to reply.',
    'To REPLACE one activity with another (e.g. "swap the museum for the aquarium"), call edit_activity with nameMatch set to the current activity and newName (and locationName) set to the replacement — this keeps its time slot. Use remove_activity only when the user wants it gone with nothing in its place.',
    'dayIndex is 0-based: Day 1 is dayIndex 0. It is shown on each day line of the summary.',
    /*
     * This used to say only "if a request is ambiguous, ask instead of
     * guessing", with nothing on the other side of the scale — so the
     * assistant treated any unstated detail as ambiguity. Asked to "update
     * day 1 with nearby attractions" it replied by asking which attractions,
     * listed four when pushed, and then asked again which of those to add.
     * Three exchanges, nothing added. Naming the places is the job.
     */
    'Ask only when you cannot tell WHAT the user wants changed — "move it later" when three activities could be meant, or a day that does not exist. Missing detail is not ambiguity: "add some attractions" already says what to do, and choosing which is your work, not theirs.',
    'Never end a turn by offering to do the thing you were just asked to do. If you have got as far as listing options, you have already chosen — add them and say what you added.',
    'Name real, specific places, never categories: "the Glenbow Museum", not "a local museum". Put the place in locationName with its city, so it reaches the map.',
    'Give every activity you add a sensible time, spaced so the day can actually be walked. A long empty stretch is worth filling: an arrival at 09:00 with nothing until 19:00 is nine hours the traveller has to plan themselves.',
    'Only act on the plan the user is currently viewing.',
    /*
     * A trailing marker rather than a tool: these are three short strings, and
     * a tool call would cost another round trip to produce them — arriving
     * after the reply the traveller is already reading.
     */
    'End every reply with up to three follow-ups the user is likely to want next, on their own line, exactly as: [[suggest: First | Second | Third]]. They are tapped, not read, so keep each under about six words and phrase them as the user would ("Add lunch on day 2", not "Would you like lunch?"). Offer what follows from what you just did; omit the line entirely if nothing sensible follows.',
    `Today's date: ${today}`,
    `Active tab: ${activeTab}`,
    `Plan: ${plan.destination} (${plan.startDate} to ${plan.endDate})`,
    // Without this the assistant cannot tell whether the trip already knows
    // it starts in Montreal, and would answer as though it did not.
    ...routeLines(plan),
    'Itinerary summary:',
    summary || '(no days yet)',
    'To-do list:',
    todoSummary || '(no tasks yet)',
    'Clipboard items:',
    clipboardSummary || '(nothing saved yet)',
  ].join('\n');
}
