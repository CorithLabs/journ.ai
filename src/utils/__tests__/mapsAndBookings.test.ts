import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapsUrlFor } from '../mapsLink';
import { findActivityBookings, bookingWarning } from '../activityBookings';
import { db, type Activity } from '../../db';

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1', name: 'Union Station', time: '09:00',
  locationName: 'Union Station', notes: '', pinnedToTodo: false, ...over,
});
const plan = { destination: 'Toronto, Canada', country: 'Canada' };

describe('mapsUrlFor', () => {
  // Coordinates point at the exact spot; re-running a name search risks the
  // same ambiguity that put pins on other continents.
  it('prefers stored coordinates over a name search', () => {
    const url = mapsUrlFor(act({ coordinates: [-79.3832, 43.6532] }), plan);
    expect(url).toContain('query=43.6532,-79.3832');
  });

  it('appends the trip context to a bare place name', () => {
    const url = decodeURIComponent(mapsUrlFor(act(), plan));
    expect(url).toContain('Union Station, Toronto, Canada');
  });

  it('does not repeat context the name already carries', () => {
    const url = decodeURIComponent(mapsUrlFor(act({ locationName: 'Union Station, Toronto' }), plan));
    expect(url).not.toContain('Toronto, Toronto');
  });

  it('falls back to the activity name when there is no location', () => {
    const url = decodeURIComponent(mapsUrlFor(act({ locationName: '' }), plan));
    expect(url).toContain('Union Station');
  });
});

const chain = (rows: unknown[]) => ({
  equals: vi.fn().mockReturnThis(),
  toArray: vi.fn().mockResolvedValue(rows),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

beforeEach(() => vi.clearAllMocks());

describe('findActivityBookings', () => {
  it('counts a clipboard item linked to the activity', async () => {
    vi.mocked(db.clipboard.where).mockReturnValue(
      chain([{ title: 'Hotel — Shinjuku Grand', linkedActivityId: 'a1' }]),
    );
    vi.mocked(db.todos.where).mockReturnValue(chain([]));
    const found = await findActivityBookings('p1', 'a1');
    expect(found).toEqual([{ label: 'Hotel — Shinjuku Grand', source: 'clipboard' }]);
  });

  it('counts a completed to-do sourced from the activity', async () => {
    vi.mocked(db.clipboard.where).mockReturnValue(chain([]));
    vi.mocked(db.todos.where).mockReturnValue(
      chain([{ title: 'Book museum tickets', sourceActivityId: 'a1', status: 'done' }]),
    );
    expect(await findActivityBookings('p1', 'a1')).toHaveLength(1);
  });

  // An open to-do is the reminder to book, not a booking — warning on it would
  // fire for every activity the user has yet to arrange.
  it('ignores an open to-do', async () => {
    vi.mocked(db.clipboard.where).mockReturnValue(chain([]));
    vi.mocked(db.todos.where).mockReturnValue(
      chain([{ title: 'Book museum tickets', sourceActivityId: 'a1', status: 'todo' }]),
    );
    expect(await findActivityBookings('p1', 'a1')).toEqual([]);
  });

  it('ignores links belonging to a different activity', async () => {
    vi.mocked(db.clipboard.where).mockReturnValue(chain([{ title: 'Other', linkedActivityId: 'a2' }]));
    vi.mocked(db.todos.where).mockReturnValue(chain([]));
    expect(await findActivityBookings('p1', 'a1')).toEqual([]);
  });
});

describe('bookingWarning', () => {
  // Naming what is at stake beats a generic "you have a booking".
  it('names a single booking', () => {
    const msg = bookingWarning([{ label: 'Hotel — Shinjuku Grand', source: 'clipboard' }]);
    expect(msg).toContain('"Hotel — Shinjuku Grand"');
  });

  it('lists several', () => {
    const msg = bookingWarning([
      { label: 'A', source: 'clipboard' },
      { label: 'B', source: 'todo' },
    ]);
    expect(msg).toContain('"A"');
    expect(msg).toContain('"B"');
  });
});
