import { describe, it, expect } from 'vitest';
import { stripMarkdown, suggestionReason } from '../plainText';

/*
 * The weather suggestions arrive as prose from a model that writes markdown by
 * habit, and were printed straight into a card — so a suggestion read
 * "**Day Swap:** move the *coastal walk* to `Day 4`" with every mark in it.
 */
describe('stripMarkdown', () => {
  it('drops emphasis in both spellings', () => {
    expect(stripMarkdown('**bold** and __also bold__')).toBe('bold and also bold');
    expect(stripMarkdown('*italic* and _also_')).toBe('italic and also');
    expect(stripMarkdown('***both***')).toBe('both');
  });

  it('drops code marks but keeps what was in them', () => {
    expect(stripMarkdown('move to `Day 4`')).toBe('move to Day 4');
  });

  it('keeps a link’s words and drops where it pointed', () => {
    expect(stripMarkdown('see [the forecast](https://example.com)')).toBe('see the forecast');
  });

  it('drops list markers, quotes and headings', () => {
    expect(stripMarkdown('- one\n* two\n> three\n## four')).toBe('one two three four');
  });

  it('leaves plain prose alone', () => {
    expect(stripMarkdown('Swap Day 1 with Day 2')).toBe('Swap Day 1 with Day 2');
  });

  // Multiplication and ordinary underscores are not emphasis.
  it('does not eat a lone mark', () => {
    expect(stripMarkdown('2 * 3 = 6')).toBe('2 * 3 = 6');
  });
});

/*
 * The card draws the change as pills and an arrow, so repeating it underneath
 * in prose is noise. What is worth keeping is the why.
 */
describe('suggestionReason', () => {
  it('keeps the part after the dash, which is the why', () => {
    expect(suggestionReason('Swap Day 1 with Day 2 — Day 2 is dry')).toBe('Day 2 is dry');
  });

  it('says nothing when the text only restates the change', () => {
    expect(suggestionReason('River Cruise → Cooking Class')).toBe('');
  });

  it('keeps a longer explanation that has no dash', () => {
    const text = 'The forecast shows heavy rain all afternoon, so an indoor plan is safer.';
    expect(suggestionReason(text)).toBe(text);
  });

  it('strips markdown from what it keeps', () => {
    expect(suggestionReason('Swap — the **rain** clears by then')).toBe('the rain clears by then');
  });
});
