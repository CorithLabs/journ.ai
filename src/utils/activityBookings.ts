import { db, type ClipboardItem, type TodoItem, type Plan } from '../db';

/**
 * Things already committed against an activity, which a time change may
 * invalidate — a table booked for 19:00, a tour that starts at 09:00.
 *
 * Two sources count:
 *   - a clipboard item linked to the activity (a confirmation, a voucher)
 *   - a completed to-do that came from it, i.e. the user ticked off booking it
 *
 * A to-do that is still open is NOT a booking: it is the reminder to make one,
 * so warning about it would fire on every activity the user has yet to arrange.
 */
export interface ActivityBooking {
  label: string;
  source: 'clipboard' | 'todo';
}

export async function findActivityBookings(
  planId: string,
  activityId: string,
): Promise<ActivityBooking[]> {
  const [clipboard, todos] = await Promise.all([
    db.clipboard.where('planId').equals(planId).toArray() as Promise<ClipboardItem[]>,
    db.todos.where('planId').equals(planId).toArray() as Promise<TodoItem[]>,
  ]);

  const bookings: ActivityBooking[] = [];

  for (const c of clipboard) {
    if (c.linkedActivityId === activityId) {
      bookings.push({ label: c.title, source: 'clipboard' });
    }
  }
  for (const t of todos) {
    if (t.sourceActivityId === activityId && t.status === 'done') {
      bookings.push({ label: t.title, source: 'todo' });
    }
  }
  return bookings;
}

/** Names what is at stake, rather than a generic "you have a booking". */
export function bookingWarning(bookings: ActivityBooking[]): string {
  if (bookings.length === 1) {
    return `"${bookings[0].label}" is linked to this activity. Changing the time may not match what you booked.`;
  }
  const names = bookings.map((b) => `"${b.label}"`).join(', ');
  return `${names} are linked to this activity. Changing the time may not match what you booked.`;
}

/**
 * The days whose plans are already committed to.
 *
 * A day holding a booked activity cannot be swapped with another: the table
 * is reserved for that evening, the tour starts on that morning. The prompt
 * asked the AI to respect this and gave it nothing to respect it with — no
 * booking data was ever passed, so the instruction could not be followed even
 * in principle.
 *
 * Computed from records already loaded rather than queried per activity, so
 * the answer costs nothing at the moment a suggestion is being offered.
 */
export function bookedDayIndexes(
  plan: Pick<Plan, 'itinerary'>,
  clipboard: ClipboardItem[],
  todos: TodoItem[],
): Set<number> {
  const committed = new Set<string>();
  for (const c of clipboard) {
    if (c.linkedActivityId) committed.add(c.linkedActivityId);
  }
  // An open to-do is the reminder to book something, not a booking — treating
  // it as one would freeze every day the user has yet to arrange.
  for (const t of todos) {
    if (t.sourceActivityId && t.status === 'done') committed.add(t.sourceActivityId);
  }

  const days = new Set<number>();
  for (const day of plan.itinerary) {
    if (day.activities.some((a) => committed.has(a.id))) days.add(day.dayIndex);
  }
  // A clipboard item linked to a whole day rather than an activity commits it
  // just the same: a hotel booked for the third night is the third night.
  for (const c of clipboard) {
    if (c.linkedDayIndex !== undefined && !c.linkedActivityId) days.add(c.linkedDayIndex);
  }
  return days;
}
