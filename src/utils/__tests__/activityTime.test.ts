import { describe, it, expect } from 'vitest';
import {
  sortByTime, swapTimes, timeToMinutes, formatTime,
  findTimeClashes, nextFreeTime, isTimeSlot, TIME_SLOTS,
} from '../activityTime';
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

  it('sorts across midday and midnight boundaries correctly', () => {
    const out = sortByTime([act('pm', '13:05'), act('am', '09:45'), act('late', '23:30'), act('early', '00:15')]);
    expect(out.map((a) => a.id)).toEqual(['early', 'am', 'pm', 'late']);
  });

  // A blank time is unknown, not midnight — putting it first would misrepresent
  // the day.
  it('puts entries with no usable time last', () => {
    const out = sortByTime([act('none', ''), act('real', '10:00'), act('junk', 'later')]);
    expect(out[0].id).toBe('real');
    expect(out.slice(1).map((a) => a.id).sort()).toEqual(['junk', 'none']);
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

describe('swapTimes', () => {
  // Splicing the array would be undone by the sort, so reordering has to
  // change the time. Swapping keeps the times the user actually typed.
  it('trades times between two activities', () => {
    const out = swapTimes([act('a', '08:00'), act('b', '14:00')], 'a', 'b');
    expect(out.find((x) => x.id === 'a')!.time).toBe('14:00');
    expect(out.find((x) => x.id === 'b')!.time).toBe('08:00');
  });

  it('leaves everything else untouched', () => {
    const out = swapTimes([act('a', '08:00'), act('mid', '10:00'), act('b', '14:00')], 'a', 'b');
    expect(out.find((x) => x.id === 'mid')!.time).toBe('10:00');
  });

  it('is a no-op when an id is missing', () => {
    const input = [act('a', '08:00')];
    expect(swapTimes(input, 'a', 'nope')).toEqual(input);
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

  // Slots and clock times share one field, so they have to interleave.
  it('sorts slots among exact times sensibly', () => {
    const out = sortByTime([
      act('night', 'night'), act('ten', '10:00'),
      act('morning', 'morning'), act('evening', 'evening'),
    ]);
    expect(out.map((a) => a.id)).toEqual(['morning', 'ten', 'evening', 'night']);
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
