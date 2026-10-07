import { describe, it, expect } from 'vitest';
import { buildGuidePrompt, parseGuide, type GuideContext } from '../placeGuide';
import type { PlaceFacts } from '../placeFacts';

const context: GuideContext = {
  name: 'Meiji Shrine',
  location: 'Shibuya, Tokyo',
  destination: 'Tokyo, Japan',
  date: '2026-10-12',
  when: 'Morning',
  weather: 'Rain, high 18°C, 70% chance of rain, wind up to 22 km/h',
  travellers: { count: 2, kids: true, kidAges: [6] },
  likes: ['temples'],
  dislikes: ['crowds'],
};
const facts: PlaceFacts = {
  wiki: { title: 'Meiji Shrine', extract: 'Meiji Shrine is a Shinto shrine in Shibuya.', url: 'https://en.wikipedia.org/wiki/Meiji_Shrine' },
  map: { openingHours: 'sunrise-sunset', fee: 'no' },
  checkedAt: '2026-10-07T00:00:00.000Z',
};
// null for "no facts at all": undefined would fall back to the default.
const promptText = (c: GuideContext = context, f: PlaceFacts | null = facts) =>
  buildGuidePrompt(c, f ?? undefined).map((m) => m.content).join('\n');

describe('what the guide is told', () => {
  it('speaks to this visit: the day, the forecast and who is going', () => {
    const p = promptText();
    expect(p).toContain('Planned date: 2026-10-12');
    expect(p).toContain('Planned time of day: Morning');
    expect(p).toContain('70% chance of rain');
    expect(p).toContain('with children aged 6');
    expect(p).toContain('They want to avoid: crowds');
  });

  it('is given the checked facts', () => {
    const p = promptText();
    expect(p).toContain('Meiji Shrine is a Shinto shrine in Shibuya.');
    expect(p).toContain('OpenStreetMap opening hours: sunrise-sunset');
  });

  // The details people act on, and the ones a model is most confidently wrong about.
  it('is told never to make up hours or prices', () => {
    expect(promptText()).toMatch(/Never state opening hours, prices, or ticket costs unless they appear in the checked facts/);
  });

  it('says so when nothing was checked', () => {
    expect(promptText(context, null)).toContain('No checked facts were found.');
  });
});

describe('what comes back', () => {
  it('keeps the guide', () => {
    const g = parseGuide(JSON.stringify({
      about: 'A forested Shinto shrine.',
      highlights: ['The torii gate', 'Sake barrels'],
      duration: '1 hour',
      bestTime: 'Early morning',
      tips: ['Bow at the gate'],
      heads: ['Rain likely: paths are gravel'],
    }), new Date('2026-10-07T10:00:00Z'));
    expect(g).toEqual({
      about: 'A forested Shinto shrine.',
      highlights: ['The torii gate', 'Sake barrels'],
      duration: '1 hour',
      bestTime: 'Early morning',
      tips: ['Bow at the gate'],
      heads: ['Rain likely: paths are gravel'],
      generatedAt: '2026-10-07T10:00:00.000Z',
    });
  });

  it('reads JSON wrapped in prose or a code fence', () => {
    expect(parseGuide('Here you go:\n```json\n{"about":"A shrine.","highlights":[],"tips":[]}\n```')?.about).toBe('A shrine.');
  });

  it('caps the lists and drops what is not text', () => {
    const g = parseGuide(JSON.stringify({ about: 'A shrine.', highlights: ['a', 'b', 'c', 'd', 'e', 'f'], tips: ['x', 3, '', null] }))!;
    expect(g.highlights).toHaveLength(4);
    expect(g.tips).toEqual(['x']);
  });

  it('is nothing when there is nothing to say', () => {
    expect(parseGuide('{"highlights":["x"]}')).toBeNull();
    expect(parseGuide('Sorry, I cannot help with that.')).toBeNull();
  });
});
