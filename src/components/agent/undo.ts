import { db, type ClipboardItem, type Plan, type TodoItem } from '../../db';

/*
 * Undo for what the chat changed.
 *
 * Before a reply's first change, the trip, its to-dos and its saved items are
 * copied; Undo puts all three back as they were. One copy per reply, so one
 * Undo reverses everything that reply did, whether it was one change or five.
 * Kept in memory for the session, like the conversation itself.
 */

interface Snapshot {
  plan: Plan;
  todos: TodoItem[];
  clipboard: ClipboardItem[];
}

const snapshots = new Map<string, Snapshot>();

export async function takeSnapshot(planId: string): Promise<string | null> {
  const plan = await db.plans.get(planId);
  if (!plan) return null;
  const [todos, clipboard] = await Promise.all([
    db.todos.where('planId').equals(planId).toArray(),
    db.clipboard.where('planId').equals(planId).toArray(),
  ]);
  const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  snapshots.set(id, { plan: structuredClone(plan), todos: [...todos], clipboard: [...clipboard] });
  return id;
}

export function canUndo(id: string | undefined): boolean {
  return !!id && snapshots.has(id);
}

/** Put the trip, its to-dos and saved items back as they were. */
export async function restoreSnapshot(id: string): Promise<boolean> {
  const snap = snapshots.get(id);
  if (!snap) return false;
  const { plan, todos, clipboard } = snap;
  await db.plans.put({ ...plan, updatedAt: new Date().toISOString() });

  const nowTodos: TodoItem[] = await db.todos.where('planId').equals(plan.id).toArray();
  const keepT = new Set(todos.map((t) => t.id));
  await db.todos.bulkDelete(nowTodos.filter((t) => !keepT.has(t.id)).map((t) => t.id));
  if (todos.length) await db.todos.bulkPut(todos);

  const nowClips: ClipboardItem[] = await db.clipboard.where('planId').equals(plan.id).toArray();
  const keepC = new Set(clipboard.map((c) => c.id));
  for (const c of nowClips) if (!keepC.has(c.id)) await db.clipboard.delete(c.id);
  if (clipboard.length) await db.clipboard.bulkPut(clipboard);

  snapshots.delete(id);
  return true;
}

/** The newest reply that can still be undone, for "undo" typed in the chat. */
export function latestUndoable(ids: (string | undefined)[]): string | null {
  for (let i = ids.length - 1; i >= 0; i--) if (canUndo(ids[i])) return ids[i]!;
  return null;
}
