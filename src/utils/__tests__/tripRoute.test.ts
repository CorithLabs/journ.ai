import { describe, it, expect } from 'vitest';
import { tripRoute } from '../travel';

const plan = (extra: Parameters<typeof tripRoute>[0]) => tripRoute(extra);

describe('the order a trip is actually travelled', () => {
  /*
   * The reported failure. A Montreal → Gaspé road trip named "Percé", with
   * Matane, Rimouski and Percé added as stops, was sent to the AI as
   * "in order: Percé, Matane, Rimouski, Percé" — so the itinerary began and
   * ended at the far point and drove the outbound leg backwards. The model
   * followed instructions exactly; the instructions were wrong.
   */
  it('drives out from where the traveller starts, and back', () => {
    expect(plan({
      destination: 'Percé',
      arrival: { city: 'Montreal', mode: 'car' },
      departure: { city: 'Montreal', mode: 'car' },
      stops: [
        { id: '1', city: 'Matane' }, { id: '2', city: 'Rimouski' }, { id: '3', city: 'Percé' },
      ],
    })).toEqual(['Montreal', 'Matane', 'Rimouski', 'Percé', 'Montreal']);
  });

  // Listing the destination as a stop as well should not put it at both ends.
  it('does not visit the destination twice', () => {
    expect(plan({
      destination: 'Percé',
      stops: [{ id: '1', city: 'Matane' }, { id: '2', city: 'Percé' }],
    })).toEqual(['Matane', 'Percé']);
  });

  // Flying somewhere, the destination is where the trip begins.
  it('starts at the destination when that is where they arrive', () => {
    expect(plan({
      destination: 'Tokyo',
      arrival: { city: 'Tokyo', mode: 'flight' },
      stops: [{ id: '1', city: 'Kyoto' }, { id: '2', city: 'Osaka' }],
    })).toEqual(['Tokyo', 'Kyoto', 'Osaka']);
  });

  it('starts at the destination when nobody said how they get there', () => {
    expect(plan({
      destination: 'Tokyo',
      stops: [{ id: '1', city: 'Kyoto' }],
    })).toEqual(['Tokyo', 'Kyoto']);
  });

  // Entering the trip somewhere else makes the destination the far point.
  it('puts the destination last when they enter the trip elsewhere', () => {
    expect(plan({
      destination: 'Percé',
      arrival: { city: 'Montreal', mode: 'car' },
      stops: [{ id: '1', city: 'Matane' }],
    })).toEqual(['Montreal', 'Matane', 'Percé']);
  });

  // A round trip genuinely names its start twice.
  it('keeps a repeat that is not consecutive', () => {
    const route = plan({
      destination: 'Percé',
      arrival: { city: 'Montreal' }, departure: { city: 'Montreal' },
      stops: [{ id: '1', city: 'Percé' }],
    });
    expect(route).toEqual(['Montreal', 'Percé', 'Montreal']);
  });

  it('collapses a repeat that is', () => {
    expect(plan({
      destination: 'Montreal',
      arrival: { city: 'Montreal' },
      stops: [{ id: '1', city: 'Quebec City' }],
    })).toEqual(['Montreal', 'Quebec City']);
  });

  it('matches a city however it was qualified', () => {
    expect(plan({
      destination: 'Percé, QC',
      arrival: { city: 'Montreal' },
      stops: [{ id: '1', city: 'Percé' }],
    })).toEqual(['Montreal', 'Percé']);
  });

  it('is just the destination for a single-city trip', () => {
    expect(plan({ destination: 'Tokyo' })).toEqual(['Tokyo']);
  });

  it('ignores a stop row left blank', () => {
    expect(plan({ destination: 'Tokyo', stops: [{ id: '1', city: '  ' }] })).toEqual(['Tokyo']);
  });
});
