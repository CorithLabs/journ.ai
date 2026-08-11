import { describe, it, expect } from 'vitest';
import { isLikelyOutdoor, outdoorActivities, hasOutdoorPlans } from '../outdoor';
import type { Activity } from '../../db';

const act = (name: string, locationName = '', notes = ''): Activity => ({
  id: 'a', name, time: 'morning', locationName, notes, pinnedToTodo: false,
});

/*
 * The weather alert is only worth showing when the weather can spoil
 * something. Without this it fired on every wet day, including one spent
 * entirely in museums — and a warning that is wrong more often than right
 * teaches people to ignore the ones that are not.
 */
describe('spotting what the weather can spoil', () => {
  it('recognises being outside', () => {
    expect(isLikelyOutdoor(act('Walk the coastal trail'))).toBe(true);
    expect(isLikelyOutdoor(act('Percé Rock boat tour'))).toBe(true);
    expect(isLikelyOutdoor(act('Forillon National Park'))).toBe(true);
  });

  it('recognises being inside', () => {
    expect(isLikelyOutdoor(act('Musée de la Gaspésie'))).toBe(false);
    expect(isLikelyOutdoor(act('Dinner at the auberge restaurant'))).toBe(false);
    expect(isLikelyOutdoor(act('Hotel check-in'))).toBe(false);
  });

  it('reads the location and notes, not just the name', () => {
    expect(isLikelyOutdoor(act('Sunset', 'Cap-Bon-Ami lookout'))).toBe(true);
    expect(isLikelyOutdoor(act('Morning plan', '', 'Cycle along the river'))).toBe(true);
  });

  /*
   * Indoor words win on purpose. "Museum garden café" is somewhere you can
   * shelter, and a false quiet costs less than a false alarm.
   */
  it('lets indoor win when both are mentioned', () => {
    expect(isLikelyOutdoor(act('Museum garden café'))).toBe(false);
    expect(isLikelyOutdoor(act('Market hall restaurant'))).toBe(false);
  });

  // An activity called "Day 3" is not a reason to warn anybody.
  it('claims nothing about words it does not know', () => {
    expect(isLikelyOutdoor(act('Day 3'))).toBe(false);
    expect(isLikelyOutdoor(act('Meet Sophie'))).toBe(false);
    expect(isLikelyOutdoor(act(''))).toBe(false);
  });

  it('does not care about case', () => {
    expect(isLikelyOutdoor(act('HIKE TO THE SUMMIT'))).toBe(true);
  });
});

describe('a day as a whole', () => {
  it('lists only what is exposed', () => {
    const day = { activities: [act('Museum'), act('Beach walk'), act('Lunch at the café')] };
    expect(outdoorActivities(day).map(a => a.name)).toEqual(['Beach walk']);
  });

  it('says a day of museums needs no warning', () => {
    expect(hasOutdoorPlans({ activities: [act('Museum'), act('Aquarium')] })).toBe(false);
  });

  it('says a day with one exposed plan does', () => {
    expect(hasOutdoorPlans({ activities: [act('Museum'), act('Coastal hike')] })).toBe(true);
  });

  // Nothing planned is nothing to spoil.
  it('says an empty day needs none', () => {
    expect(hasOutdoorPlans({ activities: [] })).toBe(false);
  });
});
