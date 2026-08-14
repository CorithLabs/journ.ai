import type { Plan, TodoItem } from '../../db';
import { slotIndex, sortByTime } from '../../utils/activityTime';
import { todayDayIndex } from '../../utils/tripDay';

/**
 * What to tap instead of typing.
 *
 * A chat with an empty composer asks the traveller to invent the request, and
 * "what can this thing do" is a worse first question than any of the answers.
 * Two sources, because the two moments are different: the app knows what is
 * worth doing before anything has been said, and after that the assistant
 * knows what it just did.
 */

/**
 * The marker the assistant appends, stripped before its reply is shown.
 *
 * A trailing line rather than a tool call: a tool would cost another round
 * trip to the model for something that is only ever three short strings, and
 * it would arrive after the reply had already been shown.
 */
const MARKER = /\[\[suggest:([^\]]*)\]\]/i;

export interface SplitReply {
  /** The reply as the traveller should see it, with the marker gone. */
  text: string;
  suggestions: string[];
}

/**
 * The assistant's reply, split from the follow-ups it proposed.
 *
 * Tolerant on purpose: a model that forgets the marker simply offers no
 * suggestions, and one that writes a malformed marker must never leave its
 * syntax sitting in the middle of a sentence the traveller reads.
 */
export function splitReply(raw: string): SplitReply {
  const match = raw.match(MARKER);
  if (!match) return { text: raw.trim(), suggestions: [] };

  const suggestions = match[1]
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    // Long enough to be a sentence is too long to be a pill.
    .filter((s) => s.length <= 60)
    .slice(0, 3);

  return { text: raw.replace(MARKER, '').trim(), suggestions };
}

/** The first day with a whole part of the day skipped between two activities. */
function dayWithGap(plan: Plan): number | null {
  for (const day of plan.itinerary) {
    const slots = sortByTime(day.activities)
      .map((a) => slotIndex(a.time))
      // Unknown times sort last and mean nothing here.
      .filter((i) => i < 4);
    for (let i = 1; i < slots.length; i++) {
      if (slots[i] - slots[i - 1] > 1) return day.dayIndex;
    }
  }
  return null;
}

/** The first day with nothing on it at all. */
function emptyDay(plan: Plan): number | null {
  return plan.itinerary.find((d) => d.activities.length === 0)?.dayIndex ?? null;
}

/**
 * What is worth asking before anything has been asked.
 *
 * Drawn from the plan rather than from a fixed list, so the offer is about
 * this trip: a day with a hole in it, a day with nothing on it, tasks still
 * open. Capped at three — a wall of pills is a menu, and a menu is the
 * problem an empty composer already has.
 */
export function openingSuggestions(
  plan: Plan | undefined,
  todos: TodoItem[] = [],
  now: Date = new Date(),
): string[] {
  if (!plan?.itinerary?.length) return [];
  const out: string[] = [];

  const gap = dayWithGap(plan);
  if (gap !== null) out.push(`Fill the gap on day ${gap + 1}`);

  const empty = emptyDay(plan);
  if (empty !== null) out.push(`Plan day ${empty + 1}`);

  const open = todos.filter((t) => t.status !== 'done').length;
  if (open > 0) out.push('What still needs booking?');

  const today = todayDayIndex(plan, now);
  if (out.length < 3) {
    out.push(today !== null ? "What's on today?" : "What's on day 1?");
  }

  return out.slice(0, 3);
}
