import { describe, it, expect } from 'vitest';
import { sortByTime, moveActivity, timeToMinutes, formatTime, findTimeClashes, nextFreeTime, isTimeSlot, TIME_SLOTS, slotForTime, slotLabel, exactTime } from '../activityTime';
import type { Activity } from '../../db';

const act = (id: string, time: string, name = id): Activity => ({
  id, name, time, locationName: '', notes: '', pinnedToTodo: false,
});

describe('sortByTime', () => {
  // An 08:00 stop added last used to sit at the bottom of the day.
  it('orders a day chronologically regardless of insertion order', () => {
    const out = sortByTime([act('c', '14:00'), act('a', '08:00'), act('b', '09:30')]);
    expect(out.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  // Night wraps past midnight, so 23:30 and 00:15 are the same part of the
  // day and keep the order they were given.
  it('groups a wrapping night together, after the rest of the day', () => {
    const out = sortByTime([act('pm', '13:05'), act('am', '09:45'), act('late', '23:30'), act('early', '00:15')]);
    expect(out.map((a) => a.id)).toEqual(['am', 'pm', 'late', 'early']);
  });

  // A blank time is unknown, not midnight — putting it first would misrepresent
  // the day.
  it('puts entries with no usable time last', () => {
    const out = sortByTime([act('none', ''), act('real', '10:00'), act('junk', 'later')]);
    expect(out[0].id).toBe('real');
    expect(out.slice(1).map((a) => a.id).sort()).toEqual(['junk', 'none']);
  });

  // Order inside a part of the day is the order the user arranged it in —
  // there are no clock times to interleave a slot full of nominal cards with.
  it('keeps the array order within one part of the day', () => {
    const out = sortByTime([act('late-morning', '11:00'), act('early-morning', '08:00')]);
    expect(out.map((a) => a.id)).toEqual(['late-morning', 'early-morning']);
  });

  it('is stable for equal times, so editing one does not shuffle its neighbours', () => {
    const out = sortByTime([act('first', '10:00'), act('second', '10:00'), act('third', '10:00')]);
    expect(out.map((a) => a.id)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input', () => {
    const input = [act('b', '12:00'), act('a', '08:00')];
    sortByTime(input);
    expect(input.map((a) => a.id)).toEqual(['b', 'a']);
  });
});

describe('moveActivity', () => {
  const ids = (out: Activity[]) => sortByTime(out).map((a) => a.id);

  // Inside one part of the day there is no clock to change, so the two cards
  // simply trade places.
  it('trades places within a slot without touching the time', () => {
    const day = [act('a', 'evening'), act('b', 'evening')];
    const out = moveActivity(day, 'b', 'up');
    expect(ids(out)).toEqual(['b', 'a']);
    expect(out.find((x) => x.id === 'b')!.time).toBe('evening');
  });

  // This is what "moving updates the time" means: the slot is the time.
  it('takes the neighbour\'s slot when crossing into it', () => {
    const day = [act('museum', 'morning'), act('dinner', 'evening')];
    const out = moveActivity(day, 'museum', 'down');
    expect(out.find((x) => x.id === 'museum')!.time).toBe('evening');
  });

  it('lands above the neighbour when moving up', () => {
    const day = [act('lunch', 'noon'), act('walk', 'evening')];
    expect(ids(moveActivity(day, 'walk', 'up'))).toEqual(['walk', 'lunch']);
  });

  /*
   * The case a clock-based sort could not handle: a nominal card moved down
   * past a card with an exact time in the target slot. Sorting on minutes
   * would leave it stuck above its neighbour, and pressing down again would
   * do nothing at all.
   */
  it('lands below a neighbour that has an exact time', () => {
    const day = [act('museum', 'morning'), act('checkin', '15:00')];
    const out = moveActivity(day, 'museum', 'down');
    expect(ids(out)).toEqual(['checkin', 'museum']);
    expect(out.find((x) => x.id === 'museum')!.time).toBe('noon');
  });

  // "3:00 PM" stops being true the moment the card is in the evening.
  it('drops an exact time that is no longer true', () => {
    const day = [act('checkin', '15:00'), act('dinner', 'evening')];
    const out = moveActivity(day, 'checkin', 'down');
    expect(out.find((x) => x.id === 'checkin')!.time).toBe('evening');
  });

  it('returns the same array at either end of the day', () => {
    const day = [act('a', 'morning'), act('b', 'night')];
    expect(moveActivity(day, 'a', 'up')).toBe(day);
    expect(moveActivity(day, 'b', 'down')).toBe(day);
    expect(moveActivity(day, 'nope', 'up')).toBe(day);
  });

  it('does not mutate the input', () => {
    const day = [act('a', 'morning'), act('b', 'evening')];
    moveActivity(day, 'a', 'down');
    expect(day.map((a) => a.time)).toEqual(['morning', 'evening']);
  });
});

describe('timeToMinutes', () => {
  it('parses valid times', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('rejects out-of-range and malformed values', () => {
    for (const bad of ['24:00', '10:60', '', 'lunchtime', '8', '10:5']) {
      expect(timeToMinutes(bad)).toBeNull();
    }
  });
});

describe('formatTime', () => {
  it('renders 12-hour labels, with noon and midnight correct', () => {
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('08:00')).toBe('8:00 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('19:05')).toBe('7:05 PM');
  });

  it('passes through anything it cannot parse', () => {
    expect(formatTime('later')).toBe('later');
  });
});

describe('time slots', () => {
  it('recognises each slot and rejects anything else', () => {
    for (const slot of TIME_SLOTS) expect(isTimeSlot(slot.id)).toBe(true);
    expect(isTimeSlot('19:00')).toBe(false);
    expect(isTimeSlot('lunchtime')).toBe(false);
  });

  it('gives slots a label rather than a clock reading', () => {
    expect(formatTime('morning')).toBe('Morning');
    expect(formatTime('night')).toBe('Night');
  });

  // A clock time is filed under its slot, so 10:00 sits with the morning.
  it('sorts exact times into their slot', () => {
    const out = sortByTime([
      act('night', 'night'), act('ten', '10:00'),
      act('morning', 'morning'), act('evening', 'evening'),
    ]);
    expect(out.map((a) => a.id)).toEqual(['ten', 'morning', 'evening', 'night']);
  });
});

describe('findTimeClashes', () => {
  // You cannot be in Shinjuku and Shibuya at 19:00.
  it('flags another activity at the same exact time', () => {
    const day = [act('shinjuku', '19:00'), act('shibuya', '19:00'), act('other', '09:00')];
    const found = findTimeClashes(day, '19:00', 'shibuya');
    expect(found.map((a) => a.id)).toEqual(['shinjuku']);
  });

  it('does not flag the activity against itself', () => {
    expect(findTimeClashes([act('a', '19:00')], '19:00', 'a')).toEqual([]);
  });

  // Sharing a slot is the entire point of choosing one.
  it('never flags a shared time slot', () => {
    const day = [act('a', 'evening'), act('b', 'evening'), act('c', 'evening')];
    expect(findTimeClashes(day, 'evening', 'c')).toEqual([]);
  });

  it('ignores unparseable times rather than grouping them together', () => {
    expect(findTimeClashes([act('a', ''), act('b', '')], '', 'b')).toEqual([]);
  });
});

describe('nextFreeTime', () => {
  it('offers the next free quarter-hour after a clash', () => {
    // Placing a third activity at 19:00 when 19:00 and 19:15 are both taken.
    const day = [act('a', '19:00'), act('b', '19:15')];
    expect(nextFreeTime(day, '19:00')).toBe('19:30');
  });

  it('skips only the slots actually occupied', () => {
    const day = [act('a', '19:00'), act('b', '19:30')];
    expect(nextFreeTime(day, '19:00')).toBe('19:15');
  });

  it('returns the same time when nothing is taken', () => {
    expect(nextFreeTime([], '19:00')).toBe('19:00');
  });

  it('gives up rather than rolling past midnight', () => {
    const day = [act('a', '23:45')];
    expect(nextFreeTime(day, '23:45', 'other')).toBeNull();
  });
});

describe('slotForTime', () => {
  // The user's own example: a 3pm check-in belongs to Noon.
  it('files a clock time under its part of the day', () => {
    expect(slotForTime('15:00')).toBe('noon');
    expect(slotForTime('09:00')).toBe('morning');
    expect(slotForTime('19:30')).toBe('evening');
  });

  it('puts each boundary on the later side', () => {
    expect(slotForTime('11:59')).toBe('morning');
    expect(slotForTime('12:00')).toBe('noon');
    expect(slotForTime('16:59')).toBe('noon');
    expect(slotForTime('17:00')).toBe('evening');
    expect(slotForTime('20:59')).toBe('evening');
    expect(slotForTime('21:00')).toBe('night');
  });

  // Night owns both sides of midnight.
  it('wraps the small hours into night', () => {
    expect(slotForTime('23:59')).toBe('night');
    expect(slotForTime('00:15')).toBe('night');
    expect(slotForTime('04:59')).toBe('night');
    expect(slotForTime('05:00')).toBe('morning');
  });

  it('passes a slot through unchanged', () => {
    for (const slot of TIME_SLOTS) expect(slotForTime(slot.id)).toBe(slot.id);
  });

  it('has no slot for a time it cannot read', () => {
    expect(slotForTime('')).toBeNull();
    expect(slotForTime('later')).toBeNull();
    expect(slotForTime(undefined)).toBeNull();
  });
});

describe('slotLabel and exactTime', () => {
  it('labels a card by its part of the day', () => {
    expect(slotLabel('15:00')).toBe('Noon');
    expect(slotLabel('evening')).toBe('Evening');
    expect(slotLabel('')).toBe('\u2014');
  });

  // Losing "check in at 3pm" to a bucket would be worse than the precision
  // the buckets spare the user, so the clock value survives alongside it.
  it('keeps a real clock time available beside the label', () => {
    expect(exactTime('15:00')).toBe('15:00');
    expect(exactTime('noon')).toBeNull();
    expect(exactTime('')).toBeNull();
  });
});
