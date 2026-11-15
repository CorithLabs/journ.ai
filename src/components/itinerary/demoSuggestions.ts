import { v4 as uuidv4 } from 'uuid';
import type { Activity, Plan } from '../../db';
import { swappableDays } from '../../utils/dayCity';
import { DEMO_RAIN_DAY_INDEX } from '../../utils/demoWeather';
import type { Suggestion } from './WeatherSuggestionsPanel';

/**
 * Ready-made answers for the sample trip's rainy day, for a visitor with no
 * AI key. The same suggestions the AI would make, in the same panel, and
 * accepting one really changes the trip — so the feature can be tried before
 * setting anything up. Only for stops still on the day: an edited sample gets
 * fewer, and a day with nothing left to suggest gets none.
 */
const INDOOR_SWAPS: { match: string; replacement: Pick<Activity, 'name' | 'locationName' | 'notes'>; why: string }[] = [
  {
    match: 'meiji shrine',
    replacement: {
      name: 'Ota Memorial Museum of Art',
      locationName: 'Harajuku, Tokyo',
      notes: 'Ukiyo-e woodblock prints, a few minutes from Takeshita Street.',
    },
    why: 'the shrine is a long walk through the forest; this keeps the morning in Harajuku and under a roof',
  },
  {
    match: 'shinjuku gyoen',
    replacement: {
      name: 'Tokyo Metropolitan Government Building',
      locationName: 'Nishi-Shinjuku, Tokyo',
      notes: 'Free observation decks on the 45th floor — the whole city from above, out of the rain.',
    },
    why: 'a garden stroll in the rain is not much of one; the free observatory is ten minutes away in Shinjuku',
  },
];

export function demoWeatherSuggestions(plan: Plan, dayIndex: number): Suggestion[] {
  if (dayIndex !== DEMO_RAIN_DAY_INDEX) return [];
  const day = plan.itinerary.find((d) => d.dayIndex === dayIndex);
  if (!day) return [];
  const out: Suggestion[] = [];

  // Day 1 first: Day 3 is the Nikko day trip, all waterfalls and shrines.
  const others = swappableDays(plan, dayIndex);
  const partner = others.find((d) => d.dayIndex === 0) ?? others[0];
  if (partner) {
    out.push({
      id: uuidv4(),
      type: 'swap',
      swapDayIndex: partner.dayIndex,
      // "Day N", not the label: labels carry their own dash, and the card
      // reads the reason from after the first one.
      description: `Swap with Day ${partner.dayIndex + 1} — Move the shrine walk and the garden to a drier day, and bring Day ${partner.dayIndex + 1}'s plans here instead.`,
      budgetWarning: false,
    });
  }

  for (const { match, replacement, why } of INDOOR_SWAPS) {
    const original = day.activities.find((a) => a.name.toLowerCase().includes(match));
    if (!original) continue;
    out.push({
      id: uuidv4(),
      type: 'alternative',
      originalActivity: original,
      originalDayIndex: dayIndex,
      replacement: { ...replacement, time: original.time },
      description: `${original.name} → ${replacement.name} — ${why[0].toUpperCase()}${why.slice(1)}.`,
      budgetWarning: false,
    });
  }
  return out;
}
