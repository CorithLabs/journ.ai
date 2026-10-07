import { describe, it, expect } from 'vitest';
import { closedOn, readableHours } from '../openingHours';

// Shinjuku Gyoen, as OpenStreetMap has it.
const GYOEN = 'Mo off; Oct 01-Mar 14 Tu-Su 09:00-16:30; Mar 15-Jun 30 Tu-Su 09:00-18:00; Dec 29-Jan 03 off';

describe('a closed day', () => {
  // The demo trip puts the garden on Monday 12 October.
  it('is caught when the place is shut that weekday', () => {
    expect(closedOn(GYOEN, '2026-10-12')).toEqual({ reason: 'Closed on Mondays' });
  });

  it('is not raised on a day it opens', () => {
    expect(closedOn(GYOEN, '2026-10-13')).toBeNull();
  });

  it('is caught across a holiday closure that spans the new year', () => {
    expect(closedOn(GYOEN, '2026-12-31')?.reason).toBe('Closed 29 Dec – 3 Jan');
    expect(closedOn(GYOEN, '2027-01-02')).not.toBeNull();
    expect(closedOn(GYOEN, '2027-01-05')).toBeNull();
  });

  it('reads a range of days', () => {
    expect(closedOn('Mo-We off; Th-Su 10:00-18:00', '2026-10-13')?.reason).toBe('Closed Mon–Wed');
  });

  // It can say closed, never open: what it does not understand, it leaves alone.
  it('says nothing about hours it cannot read', () => {
    expect(closedOn('sunrise-sunset', '2026-10-12')).toBeNull();
    expect(closedOn('Mo-Fr 09:00-17:00; PH off', '2026-10-12')).toBeNull();
    expect(closedOn(undefined, '2026-10-12')).toBeNull();
    expect(closedOn(GYOEN, undefined)).toBeNull();
  });
});

describe('hours a person can read', () => {
  it('spells out days, dates and closures', () => {
    expect(readableHours(GYOEN)).toEqual([
      'Closed Mon',
      '1 Oct – 14 Mar Tue–Sun 09:00–16:30',
      '15 Mar – 30 Jun Tue–Sun 09:00–18:00',
      'Closed 29 Dec – 3 Jan',
    ]);
  });

  it('says open all hours plainly', () => {
    expect(readableHours('24/7')).toEqual(['Open 24 hours']);
  });
});
