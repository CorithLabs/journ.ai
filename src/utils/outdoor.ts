import type { Activity, Day } from '../db';

/**
 * Whether an activity is likely to be outdoors.
 *
 * The weather alert is only worth showing when the weather can actually spoil
 * something. Without this it fired on every wet day, including one spent
 * entirely in museums — a warning that is wrong more often than right teaches
 * people to ignore the ones that are not.
 *
 * This is a guess from words, and it is worth being plain about that. It reads
 * the name, the location and the notes, and it cannot know that "Sagrada
 * Família" involves a queue in the sun or that a "market" is under a roof.
 * Two things keep the guess honest:
 *
 *   - Indoor words win. "Museum garden café" is somewhere you can shelter, so
 *     a false quiet is preferred to a false alarm.
 *   - Nothing recognised means no claim, so an activity called "Day 3" does
 *     not become a reason to warn anybody.
 */

const OUTDOOR = [
  'park', 'beach', 'hike', 'hiking', 'walk', 'walking', 'trail', 'garden',
  'market', 'zoo', 'safari', 'picnic', 'cycle', 'cycling', 'bike', 'kayak',
  'canoe', 'sail', 'boat', 'cruise', 'ferry', 'island', 'mountain', 'summit',
  'lookout', 'viewpoint', 'lake', 'river', 'waterfall', 'falls', 'cliff',
  'coast', 'shore', 'harbour', 'harbor', 'pier', 'terrace', 'rooftop',
  'vineyard', 'orchard', 'farm', 'forest', 'woods', 'canyon', 'dune',
  'ruins', 'outdoor', 'open-air', 'stroll', 'tour of the', 'street food',
];

const INDOOR = [
  'museum', 'gallery', 'aquarium', 'cinema', 'theatre', 'theater', 'mall',
  'shopping centre', 'shopping center', 'restaurant', 'café', 'cafe', 'bar',
  'pub', 'spa', 'onsen', 'bath', 'library', 'hotel', 'check-in', 'check in',
  'airport', 'station', 'indoor', 'workshop', 'class', 'tasting', 'arcade',
  'planetarium', 'basement', 'brewery', 'distillery',
];

function haystack(activity: Activity): string {
  return `${activity.name} ${activity.locationName ?? ''} ${activity.notes ?? ''}`.toLowerCase();
}

function mentions(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

export function isLikelyOutdoor(activity: Activity): boolean {
  const text = haystack(activity);
  // Checked first on purpose: a false quiet costs less than a false alarm.
  if (mentions(text, INDOOR)) return false;
  return mentions(text, OUTDOOR);
}

/** The activities on a day that the weather could actually spoil. */
export function outdoorActivities(day: Pick<Day, 'activities'>): Activity[] {
  return day.activities.filter(isLikelyOutdoor);
}

/** Whether a day has anything worth warning about at all. */
export function hasOutdoorPlans(day: Pick<Day, 'activities'>): boolean {
  return day.activities.some(isLikelyOutdoor);
}
