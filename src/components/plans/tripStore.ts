import { db } from '../../db';
import { buildTripFile, tripFromFile } from '../../services/tripTransfer';

/**
 * A full copy of a trip: itinerary, to-dos and clipboard notes, every id new
 * and every link kept. The name says it is a copy; the destination does not,
 * because the map, weather and place lookups search for the destination.
 * Attached files are not copied (as in an export); the note says so.
 */
export async function duplicateTrip(planId: string): Promise<string | null> {
  const plan = await db.plans.get(planId);
  if (!plan) return null;
  const [todos, clipboard] = await Promise.all([
    db.todos.where('planId').equals(planId).toArray(),
    db.clipboard.where('planId').equals(planId).toArray(),
  ]);
  const copy = tripFromFile(buildTripFile(plan, todos, clipboard));
  copy.plan.name = `${plan.name || plan.destination} (copy)`;
  await db.plans.add(copy.plan);
  if (copy.todos.length) await db.todos.bulkAdd(copy.todos);
  if (copy.clipboard.length) await db.clipboard.bulkAdd(copy.clipboard);
  return copy.plan.id;
}

/** Hidden, and restorable until purged. */
export function softDeleteTrip(planId: string) {
  return db.plans.update(planId, { deleted: true, updatedAt: new Date().toISOString() });
}

export function restoreTrip(planId: string) {
  return db.plans.update(planId, { deleted: false, updatedAt: new Date().toISOString() });
}

/** Gone for good, with its to-dos and clipboard, which used to be left behind. */
export async function purgeTrip(planId: string) {
  await Promise.all([
    db.todos.where('planId').equals(planId).delete(),
    db.clipboard.where('planId').equals(planId).delete(),
  ]);
  await db.plans.delete(planId);
}

/** Trips deleted in a session that closed before the undo ran out. */
export async function purgeDeletedTrips() {
  const gone = await db.plans.filter((p) => p.deleted).toArray();
  for (const p of gone) await purgeTrip(p.id);
}
