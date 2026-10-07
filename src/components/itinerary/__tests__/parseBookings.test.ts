import { describe, it, expect } from 'vitest';
import { parseBookings } from '../IntakeChat';

/*
 * The "no" check once held a literal backspace character where `\b` was
 * meant, so a typed "no" or "nope" never counted as a no.
 */
describe('reading what has been booked', () => {
  it.each(['no', 'No', 'no.', 'no, nothing yet', 'Neither', 'not yet', 'none'])('reads "%s" as nothing booked', (answer) => {
    expect(parseBookings(answer)).toEqual({ travel: false, accommodation: false });
  });

  it('does not read a word that starts with "no" as a no', () => {
    expect(parseBookings('Nothing but the hotel')).toEqual({ travel: false, accommodation: true });
  });

  it('reads both', () => {
    expect(parseBookings('Both booked')).toEqual({ travel: true, accommodation: true });
  });

  it('reads one of the two', () => {
    expect(parseBookings('Hotel only')).toEqual({ travel: false, accommodation: true });
    expect(parseBookings('Flights only')).toEqual({ travel: true, accommodation: false });
  });
});
