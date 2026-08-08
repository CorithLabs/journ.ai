import { describe, it, expect } from 'vitest';
import { repairJson, extractJson } from '../jsonRepair';

const parsed = (s: string | null) => JSON.parse(s as string);

describe('repairJson', () => {
  it('leaves valid JSON exactly as it was', () => {
    const good = '{"a":1,"b":[1,2,{"c":"d"}]}';
    expect(repairJson(good)).toBe(good);
  });

  /*
   * The failure this was written for: a real eight-day itinerary arrived with
   * `..."budgetWarning":true}]}},{"dayIndex":6` — the day object closed twice.
   * One stray character made the whole trip unreadable.
   */
  it('drops a closer the model added twice, keeping everything after it', () => {
    const broken = '{"days":[{"i":0,"acts":["a"]}},{"i":1,"acts":["b"]}]}';
    expect(parsed(repairJson(broken))).toEqual({
      days: [{ i: 0, acts: ['a'] }, { i: 1, acts: ['b'] }],
    });
  });

  it('drops a closer of the wrong kind', () => {
    expect(parsed(repairJson('{"a":[1,2}]}'))).toEqual({ a: [1, 2] });
  });

  it('closes a response that stopped mid-structure', () => {
    expect(parsed(repairJson('{"days":[{"i":0,"name":"Museum"}'))).toEqual({
      days: [{ i: 0, name: 'Museum' }],
    });
  });

  // A name cut in half is still a name; losing the other seven days is not.
  it('closes a response that stopped inside a string', () => {
    expect(parsed(repairJson('{"days":[{"name":"Visit the Roy'))).toEqual({ days: [{}] });
  });

  it('drops a key left without a value', () => {
    expect(parsed(repairJson('{"a":1,"b":'))).toEqual({ a: 1 });
  });

  it('drops a trailing comma left by the cut', () => {
    expect(parsed(repairJson('{"a":[1,2,'))).toEqual({ a: [1, 2] });
  });

  // Braces inside a string are text, not structure.
  it('does not treat braces inside strings as containers', () => {
    const s = '{"note":"closes with } and ] inside"}';
    expect(parsed(repairJson(s))).toEqual({ note: 'closes with } and ] inside' });
  });

  it('respects an escaped quote', () => {
    const s = '{"note":"a \\" quote"}';
    expect(parsed(repairJson(s))).toEqual({ note: 'a " quote' });
  });
});

describe('extractJson', () => {
  it('finds the object inside surrounding prose', () => {
    expect(parsed(extractJson('Here you go:\n{"a":1}\nHope that helps!'))).toEqual({ a: 1 });
  });

  it('stops at the end of the first value rather than swallowing what follows', () => {
    expect(parsed(extractJson('{"a":1} and then {"b":2}'))).toEqual({ a: 1 });
  });

  it('handles a bare array of days', () => {
    expect(parsed(extractJson('[{"dayIndex":0}]'))).toEqual([{ dayIndex: 0 }]);
  });

  it('has nothing to offer when there is no JSON at all', () => {
    expect(extractJson('I cannot help with that.')).toBeNull();
  });
});
