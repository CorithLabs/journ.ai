/*
 * Requests the app can carry out itself, without asking the AI.
 *
 * A swap, a move, a removal, ticking something off: when the words say
 * exactly what to do, a round trip to a language model only adds a wait, a
 * cost, and a chance to misread. These run at once, and without a key. Any
 * request that does not match, or names something the app cannot find, goes
 * to the AI as before.
 */

export type LocalCommand =
  | { kind: 'undo' }
  | { kind: 'action'; name: string; args: Record<string, unknown>; fallback?: { name: string; args: Record<string, unknown> } };

const PART = '(morning|noon|afternoon|evening|night)';
const day = (n: string | undefined) => (n ? Number(n) - 1 : undefined);
const clean = (s: string) => s.trim().replace(/^(the|my)\s+/i, '').replace(/[.!?]+$/, '').trim();

export function parseLocalCommand(raw: string): LocalCommand | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  let m: RegExpExecArray | null;

  if (/^undo( that| it| last( change)?)?[.!]?$/i.test(text)) return { kind: 'undo' };

  // "Add to-do: pack an umbrella", "todo: book the train" — the briefing's pills too.
  if ((m = /^(?:add (?:a )?)?to-?do:? (.+)$/i.exec(text))) {
    const title = m[1].trim().replace(/[.!]+$/, '');
    return { kind: 'action', name: 'add_todo', args: { title: title[0].toUpperCase() + title.slice(1), category: /^pack\b/i.test(title) ? 'Packing' : 'Other' } };
  }

  // "swap X on day 1 with Y on day 2", "swap X and Y"
  if ((m = /^swap (.+?)(?: (?:on|in) day (\d+))? (?:with|and|for) (.+?)(?: (?:on|in) day (\d+))?$/i.exec(text))) {
    return { kind: 'action', name: 'swap_activities', args: { nameA: clean(m[1]), dayA: day(m[2]), nameB: clean(m[3]), dayB: day(m[4]) } };
  }

  // "move X to day 2", "move X to day 2 morning", "move X to the evening (on day 3)"
  if ((m = new RegExp(`^move (.+?) to day (\\d+)(?:,? (?:in the |for )?${PART})?$`, 'i').exec(text))) {
    return { kind: 'action', name: 'move_activity', args: { nameMatch: clean(m[1]), toDayIndex: day(m[2]), ...(m[3] ? { time: m[3].toLowerCase() } : {}) } };
  }
  if ((m = new RegExp(`^move (.+?) to (?:the )?${PART}(?: (?:on|of) day (\\d+))?$`, 'i').exec(text))) {
    return { kind: 'action', name: 'move_activity', args: { nameMatch: clean(m[1]), time: m[2].toLowerCase(), ...(m[3] ? { toDayIndex: day(m[3]) } : {}) } };
  }

  // "remove X (from day 2)", "delete X" — an activity, or else a to-do of that name.
  if ((m = /^(?:remove|delete) (.+?)(?: (?:from|on) day (\d+))?$/i.exec(text))) {
    const name = clean(m[1]);
    return {
      kind: 'action',
      name: 'remove_activity',
      args: { nameMatch: name, dayIndex: day(m[2]) },
      fallback: m[2] ? undefined : { name: 'remove_todo', args: { titleMatch: name } },
    };
  }

  // "mark X done", "tick off X", "done: X", "complete X"
  if ((m = /^(?:mark|tick) (.+?) (?:as )?(?:done|complete|off)$/i.exec(text)) || (m = /^(?:tick off|complete|done:?) (.+)$/i.exec(text))) {
    return { kind: 'action', name: 'complete_todo', args: { titleMatch: clean(m[1]) } };
  }

  return null;
}
