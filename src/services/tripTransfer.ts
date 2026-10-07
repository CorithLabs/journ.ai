import { v4 as uuidv4 } from 'uuid';
import { db, type ClipboardItem, type Plan, type TodoItem } from '../db';

/*
 * A trip, as a file: to move it to another device or browser, or to keep a
 * copy, since nothing here is backed up.
 *
 * What goes in: the plan with its itinerary, its to-dos, and its clipboard
 * items' words. What stays out: attached files (boarding passes, booking
 * PDFs — personal documents, and large), and anything to do with AI keys,
 * which live in their own encrypted store and are never part of a trip.
 */

export const TRIP_FILE_KIND = 'journ.ai trip';
export const TRIP_FILE_VERSION = 1;

type ClipboardWords = Omit<ClipboardItem, 'fileBlob' | 'fileName' | 'fileSize'>;

export interface TripFile {
  kind: typeof TRIP_FILE_KIND;
  version: number;
  exportedAt: string;
  plan: Plan;
  todos: TodoItem[];
  clipboard: ClipboardWords[];
}

/** The file's contents. Attached files are dropped; the note says so where one was. */
export function buildTripFile(plan: Plan, todos: TodoItem[], clipboard: ClipboardItem[], now = new Date()): TripFile {
  return {
    kind: TRIP_FILE_KIND,
    version: TRIP_FILE_VERSION,
    exportedAt: now.toISOString(),
    plan: { ...plan, deleted: false },
    todos,
    clipboard: clipboard.map(({ fileBlob: _b, fileName, fileSize: _s, ...words }) => ({
      ...words,
      // The document is not in the file, but its name says what was there.
      body: fileName ? [words.body, `(Attached file not included: ${fileName})`].filter(Boolean).join('\n\n') : words.body,
    })),
  };
}

/** e.g. "tokyo-2026-10-11.journ.json" */
export function tripFileName(plan: Pick<Plan, 'destination' | 'startDate'>): string {
  const place = plan.destination.split(',')[0]
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'trip';
  return `${place}${plan.startDate ? `-${plan.startDate.slice(0, 10)}` : ''}.journ.json`;
}

export class TripFileError extends Error {}

/** Read a file's text as a trip, or say plainly why it is not one. */
export function parseTripFile(text: string): TripFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new TripFileError('This file is not a journ.ai trip: it could not be read as JSON.');
  }
  const f = data as Partial<TripFile> | null;
  if (!f || typeof f !== 'object' || f.kind !== TRIP_FILE_KIND) {
    throw new TripFileError('This file is not a journ.ai trip.');
  }
  if (typeof f.version !== 'number' || f.version > TRIP_FILE_VERSION) {
    throw new TripFileError('This trip was exported by a newer version of journ.ai. Update the app and try again.');
  }
  const p = f.plan as Partial<Plan> | undefined;
  if (!p || typeof p.destination !== 'string' || typeof p.startDate !== 'string' || typeof p.endDate !== 'string' || !Array.isArray(p.itinerary)) {
    throw new TripFileError('This trip file is missing its destination, dates or itinerary.');
  }
  return {
    kind: TRIP_FILE_KIND,
    version: f.version,
    exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : '',
    plan: f.plan as Plan,
    todos: Array.isArray(f.todos) ? f.todos : [],
    clipboard: Array.isArray(f.clipboard) ? f.clipboard : [],
  };
}

/**
 * The records to add for an imported trip.
 *
 * Every id is new — the plan's, each activity's, each to-do's and clipboard
 * item's — and the links between them are carried over to the new ids, so
 * importing a trip twice, or into the browser it came from, gives a second
 * trip and never overwrites or tangles with the first.
 */
export function tripFromFile(file: TripFile, now = new Date(), newId: () => string = uuidv4): {
  plan: Plan; todos: TodoItem[]; clipboard: ClipboardItem[];
} {
  const at = now.toISOString();
  const planId = newId();
  const activityIds = new Map<string, string>();

  const itinerary = file.plan.itinerary.map((day) => ({
    ...day,
    activities: (Array.isArray(day.activities) ? day.activities : []).map((a) => {
      const id = newId();
      if (a.id) activityIds.set(a.id, id);
      return { ...a, id };
    }),
  }));
  const relink = (id: string | undefined) => (id ? activityIds.get(id) : undefined);

  return {
    plan: { ...file.plan, id: planId, itinerary, deleted: false, createdAt: at, updatedAt: at },
    todos: file.todos.map((t) => ({ ...t, id: newId(), planId, sourceActivityId: relink(t.sourceActivityId), createdAt: t.createdAt || at, updatedAt: at })),
    clipboard: file.clipboard.map((c) => ({ ...c, id: newId(), planId, linkedActivityId: relink(c.linkedActivityId), createdAt: c.createdAt || at, updatedAt: at })),
  };
}

/** The trip as a file's text and name, ready to save. */
export async function exportTrip(planId: string): Promise<{ name: string; text: string }> {
  const plan = await db.plans.get(planId);
  if (!plan) throw new TripFileError('That trip could not be found.');
  const [todos, clipboard] = await Promise.all([
    db.todos.where('planId').equals(planId).toArray(),
    db.clipboard.where('planId').equals(planId).toArray(),
  ]);
  return { name: tripFileName(plan), text: JSON.stringify(buildTripFile(plan, todos, clipboard), null, 2) };
}

/** Add the trip in a file as a new trip; returns its id. */
export async function importTrip(text: string): Promise<string> {
  const { plan, todos, clipboard } = tripFromFile(parseTripFile(text));
  await db.plans.add(plan);
  if (todos.length) await db.todos.bulkAdd(todos);
  if (clipboard.length) await db.clipboard.bulkAdd(clipboard);
  return plan.id;
}

/** Hand the browser a file to save. */
export function saveFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
