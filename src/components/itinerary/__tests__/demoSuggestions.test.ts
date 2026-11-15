import { describe, it, expect } from 'vitest';
import { demoWeatherSuggestions } from '../demoSuggestions';
import type { Plan } from '../../../db';
import { suggestionReason } from '../../../utils/plainText';

const act = (name: string, time = '09:00') => ({ id: name, name, time, locationName: '', notes: '', pinnedToTodo: false, budgetWarning: false });
const plan = {
  id: 'demo', destination: 'Tokyo, Japan', startDate: '2026-11-22', endDate: '2026-11-24',
  itinerary: [
    { dayIndex: 0, label: 'Day 1 — Tokyo Arrival', activities: [act('Senso-ji Temple')] },
    { dayIndex: 1, label: 'Day 2 — Culture & Parks', activities: [act('Meiji Shrine', '09:00'), act('Shinjuku Gyoen', '13:30')] },
    { dayIndex: 2, label: 'Day 3 — Day Trip', activities: [act('Kegon Falls')] },
  ],
} as unknown as Plan;

describe('built-in suggestions for the sample trip', () => {
  it('offers a swap with Day 1 and an indoor stop for each outdoor one', () => {
    const s = demoWeatherSuggestions(plan, 1);
    expect(s[0]).toMatchObject({ type: 'swap', swapDayIndex: 0 });
    expect(suggestionReason(s[0].description)).toBe("Move the shrine walk and the garden to a drier day, and bring Day 1's plans here instead.");
    expect(s.slice(1).map((x) => [x.originalActivity?.name, x.replacement?.name, x.replacement?.time])).toEqual([
      ['Meiji Shrine', 'Ota Memorial Museum of Art', '09:00'],
      ['Shinjuku Gyoen', 'Tokyo Metropolitan Government Building', '13:30'],
    ]);
  });

  it('skips stops the visitor has already removed', () => {
    const edited = { ...plan, itinerary: plan.itinerary.map((d) => d.dayIndex === 1 ? { ...d, activities: [act('Shinjuku Gyoen')] } : d) } as Plan;
    expect(demoWeatherSuggestions(edited, 1).filter((x) => x.type === 'alternative')).toHaveLength(1);
  });

  it('has nothing for any other day', () => {
    expect(demoWeatherSuggestions(plan, 0)).toEqual([]);
  });
});
