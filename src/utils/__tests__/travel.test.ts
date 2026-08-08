import { describe, it, expect } from 'vitest';
import { travelBookingTitle, travelModeLabel, tripCountries, tripCities, describeLeg } from '../travel';

describe('travelBookingTitle', () => {
  it('words the task for how they are travelling', () => {
    expect(travelBookingTitle('flight', 'Tokyo')).toBe('Book flights to Tokyo');
    expect(travelBookingTitle('train', 'Kyoto')).toBe('Book train tickets to Kyoto');
    expect(travelBookingTitle('bus', 'Nara')).toBe('Book bus tickets to Nara');
    expect(travelBookingTitle('ferry', 'Naoshima')).toBe('Book ferry tickets to Naoshima');
  });

  // Inventing a task so the list looks complete is how a to-do list stops
  // being trustworthy.
  it('has nothing to book for a road trip', () => {
    expect(travelBookingTitle('car', 'Banff')).toBeNull();
  });

  // Not a flight, but not nothing either.
  it('stays neutral when nobody has said how', () => {
    expect(travelBookingTitle(undefined, 'Tokyo')).toBe('Book travel to Tokyo');
  });
});

describe('tripCountries', () => {
  // Entry rules are per country, so a route through three needs three checks.
  it('lists every country the trip touches, in order', () => {
    expect(tripCountries({
      country: 'France',
      stops: [{ id: '1', city: 'Geneva', country: 'Switzerland' }, { id: '2', city: 'Turin', country: 'Italy' }],
    })).toEqual(['France', 'Switzerland', 'Italy']);
  });

  it('counts a country once however many cities are in it', () => {
    expect(tripCountries({
      country: 'Japan',
      stops: [{ id: '1', city: 'Kyoto', country: 'Japan' }, { id: '2', city: 'Osaka', country: 'Japan' }],
    })).toEqual(['Japan']);
  });

  it('includes the country flown into when it differs', () => {
    expect(tripCountries({ country: 'Canada', arrival: { city: 'Buffalo', country: 'United States' } }))
      .toEqual(['United States', 'Canada']);
  });

  it('has nothing to offer for a plan with no resolved country', () => {
    expect(tripCountries({ country: undefined })).toEqual([]);
  });
});

describe('tripCities', () => {
  it('puts the destination first and the stops in visit order', () => {
    expect(tripCities({
      destination: 'Tokyo',
      stops: [{ id: '1', city: 'Kyoto' }, { id: '2', city: 'Osaka' }],
    })).toEqual(['Tokyo', 'Kyoto', 'Osaka']);
  });
});

describe('describeLeg', () => {
  it('reads back what was actually given', () => {
    expect(describeLeg({ mode: 'flight', city: 'Osaka', date: '2025-07-14', time: '22:40' }, 'Kyoto'))
      .toBe('Flight · Osaka · 2025-07-14 22:40');
  });

  it('falls back to the destination when no city was named', () => {
    expect(describeLeg({ mode: 'train', time: '08:00' }, 'Kyoto')).toBe('Train · Kyoto · 08:00');
  });

  // Nothing said should stay nothing said, not become a guess.
  it('says nothing about a leg that was never filled in', () => {
    expect(describeLeg(undefined, 'Kyoto')).toBeNull();
    expect(describeLeg({}, '')).toBeNull();
  });
});

describe('travelModeLabel', () => {
  it('names each mode', () => {
    expect(travelModeLabel('car')).toBe('Car');
    expect(travelModeLabel(undefined)).toBe('Travel');
  });
});
