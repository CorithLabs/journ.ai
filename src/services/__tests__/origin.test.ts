import { describe, it, expect } from 'vitest';
import { cityFromTimeZone } from '../origin';

// The time zone names a city, with no permission prompt.
describe('a city from the time zone', () => {
  it.each([
    ['America/Toronto', 'Toronto'],
    ['Asia/Tokyo', 'Tokyo'],
    ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
    ['Europe/London', 'London'],
  ])('%s gives %s', (tz, city) => {
    expect(cityFromTimeZone(tz)).toBe(city);
  });

  it.each(['UTC', 'Etc/GMT+5', 'US/Eastern', ''])('names nothing for "%s"', (tz) => {
    expect(cityFromTimeZone(tz)).toBeNull();
  });
});
