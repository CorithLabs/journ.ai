import { db, type ClipboardItem, type TodoItem } from '../db';

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
