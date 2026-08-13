import { describe, it, expect } from 'vitest';
import { internationalFlightDefaults } from '../tripDefaults';
import { airportForCity, airportLabel } from '../../data/airports';

const base = {
  destination: 'Tokyo, Japan',
  country: 'Japan',
  startDate: '2025-07-14',
  endDate: '2025-07-21',
  arrival: {},
  departure: {},
};

describe('which airport a city means', () => {
  it('picks the international one where a city has several', () => {
    // Heathrow over Gatwick, Stansted, Luton and City.
    expect(airportForCity('London')?.iata).toBe('LHR');
    // Charles de Gaulle over Orly, which is domestic and short-haul.
    expect(airportForCity('Paris')?.iata).toBe('CDG');
    // Suvarnabhumi over Don Mueang, the low-cost airport.
    expect(airportForCity('Bangkok')?.iata).toBe('BKK');
    // Ezeiza over Aeroparque, which is domestic.
    expect(airportForCity('Buenos Aires')?.iata).toBe('EZE');
  });

  /*
   * Some cities have no airport at all, and the leg has to say where you
   * actually land — `city` anchors geocoding and decides which city a day
   * belongs to, so it cannot become the name of a city you never visit.
   */
  it('names the city the airport is in when it is somewhere else', () => {
    expect(airportForCity('Kyoto')).toMatchObject({ iata: 'KIX', city: 'Osaka', elsewhere: true });
    expect(airportForCity('Banff')).toMatchObject({ iata: 'YYC', city: 'Calgary', elsewhere: true });
  });

  it('is not confused by a destination carrying its country', () => {
    expect(airportForCity('Tokyo, Japan')?.iata).toBe('NRT');
  });

  // A blank field invites the traveller to name theirs; a wrong guess has to
  // be spotted before it can be corrected.
  it('admits when it does not know one', () => {
    expect(airportForCity('Percé')).toBeNull();
    expect(airportForCity('')).toBeNull();
    expect(airportForCity(undefined)).toBeNull();
  });

  it('labels an airport by name and code', () => {
    expect(airportLabel(airportForCity('Tokyo')!)).toBe('Narita International (NRT)');
  });
});

/*
 * Saying a trip crosses a border answers most of the travel section by
 * implication, and every one of those answers used to be typed by hand behind
 * a collapsed section.
 */
describe('what an international trip fills in', () => {
  it('assumes a flight, into the destination, on the trip dates', () => {
    const { arrival, departure } = internationalFlightDefaults(base);

    expect(arrival).toMatchObject({
      mode: 'flight',
      city: 'Tokyo',
      country: 'Japan',
      airport: 'Narita International (NRT)',
      date: '2025-07-14',
    });
    expect(departure).toMatchObject({ mode: 'flight', city: 'Tokyo', date: '2025-07-21' });
  });

  // You come home from where you arrived. It is the common case and the one
  // worth guessing.
  it('sends you home from where you landed', () => {
    const { arrival, departure } = internationalFlightDefaults(base);
    expect(departure.city).toBe(arrival.city);
    expect(departure.airport).toBe(arrival.airport);
  });

  it('lands you at the airport, not at a city with none', () => {
    const { arrival } = internationalFlightDefaults({ ...base, destination: 'Kyoto', country: 'Japan' });
    expect(arrival.city).toBe('Osaka');
    expect(arrival.airport).toBe('Kansai International (KIX)');
  });

  it('still fills what it can for a city it knows no airport for', () => {
    const { arrival } = internationalFlightDefaults({ ...base, destination: 'Percé', country: 'Canada' });
    expect(arrival).toMatchObject({ mode: 'flight', city: 'Percé', date: '2025-07-14' });
    expect(arrival.airport).toBeUndefined();
  });

  /*
   * These are defaults, not decisions. Anything already answered stays
   * answered — an open-jaw trip home from another city, a train across a
   * border, an overnight flight leaving the day before.
   */
  describe('leaves an answer already given', () => {
    it('keeps a different way of travelling', () => {
      const { arrival } = internationalFlightDefaults({
        ...base, arrival: { mode: 'train' },
      });
      expect(arrival.mode).toBe('train');
    });

    it('keeps a departure from somewhere else', () => {
      const { departure } = internationalFlightDefaults({
        ...base, departure: { city: 'Osaka' },
      });
      expect(departure.city).toBe('Osaka');
    });

    it('keeps a date outside the trip', () => {
      const { arrival } = internationalFlightDefaults({
        ...base, arrival: { date: '2025-07-13' },
      });
      expect(arrival.date).toBe('2025-07-13');
    });

    it('keeps an airport the traveller named', () => {
      const { arrival } = internationalFlightDefaults({
        ...base, arrival: { airport: 'Haneda (HND)' },
      });
      expect(arrival.airport).toBe('Haneda (HND)');
    });
  });
});
