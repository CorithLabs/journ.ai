import { streamCompletion, type ChatMessage } from './aiClient';
import { extractJson } from '../utils/jsonRepair';
import type { PlaceFacts } from './placeFacts';

/**
 * A short guide to one stop, written by the AI from what is known about it.
 *
 * It is given the checked facts (Wikipedia, OpenStreetMap) and the trip — the
 * day it is planned for, the part of the day, the forecast, who is going and
 * what they like — so it can say something about *this* visit, not repeat a
 * brochure. It is told never to supply opening hours or prices of its own:
 * those are the details travellers act on, and the ones a model is most
 * confidently wrong about.
 */

export interface PlaceGuide {
  /** One or two sentences: what this place is. */
  about: string;
  /** What to see or do there, most worth it first. */
  highlights: string[];
  /** Typical time spent, e.g. "1–2 hours". */
  duration?: string;
  /** When to go, e.g. "Early morning, before the tour groups". */
  bestTime?: string;
  /** Practical things to know: cash only, shoes off, book ahead. */
  tips: string[];
  /** Anything about this visit specifically that needs attention. */
  heads?: string[];
  generatedAt: string;
}

export interface GuideContext {
  name: string;
  location?: string;
  address?: string;
  destination: string;
  /** ISO date the visit is planned for, when known. */
  date?: string;
  /** "Morning", "Noon", "Evening", "Night", or a clock time. */
  when?: string;
  weather?: string;
  travellers?: { count?: number | null; kids?: boolean | null; kidAges?: number[] | null };
  likes?: string[];
  dislikes?: string[];
  budget?: string | null;
  notes?: string;
}

function factsBlock(facts?: PlaceFacts): string {
  if (!facts) return 'No checked facts were found.';
  const lines: string[] = [];
  if (facts.wiki) lines.push(`Wikipedia ("${facts.wiki.title}"): ${facts.wiki.extract.slice(0, 1400)}`);
  const m = facts.map;
  if (m) {
    if (m.kind) lines.push(`OpenStreetMap kind: ${m.kind}`);
    if (m.openingHours) lines.push(`OpenStreetMap opening hours: ${m.openingHours}`);
    if (m.fee) lines.push(`OpenStreetMap fee: ${m.fee}`);
    if (m.wheelchair) lines.push(`OpenStreetMap wheelchair access: ${m.wheelchair}`);
    if (m.cuisine) lines.push(`OpenStreetMap cuisine: ${m.cuisine}`);
  }
  return lines.length ? lines.join('\n') : 'No checked facts were found.';
}

function contextBlock(c: GuideContext): string {
  const who = c.travellers
    ? [
        c.travellers.count ? `${c.travellers.count} travellers` : null,
        c.travellers.kids ? `with children${c.travellers.kidAges?.length ? ` aged ${c.travellers.kidAges.join(', ')}` : ''}` : null,
      ].filter(Boolean).join(', ')
    : '';
  return [
    `Place: ${c.name}`,
    c.location ? `Location as written: ${c.location}` : null,
    c.address ? `Found at: ${c.address}` : null,
    `Trip destination: ${c.destination}`,
    c.date ? `Planned date: ${c.date}` : null,
    c.when ? `Planned time of day: ${c.when}` : null,
    c.weather ? `Forecast that day: ${c.weather}` : null,
    who ? `Travelling: ${who}` : null,
    c.likes?.length ? `They like: ${c.likes.join(', ')}` : null,
    c.dislikes?.length ? `They want to avoid: ${c.dislikes.join(', ')}` : null,
    c.budget ? `Budget: ${c.budget}` : null,
    c.notes ? `Their notes: ${c.notes.slice(0, 400)}` : null,
  ].filter(Boolean).join('\n');
}

const RULES = `Rules:
- Never state opening hours, prices, or ticket costs unless they appear in the checked facts. If they matter, say to check them, without guessing.
- If checked opening hours are given and the planned date and time of day fall outside them, put that first in "heads".
- If the forecast affects the visit (rain, heat, wind, snow), say how in "heads".
- If you are not confident this is a real, specific place, keep "about" general and leave "highlights" empty.
- Be specific to this place. No filler like "a must-see destination". British English. Short sentences.`;

export function buildGuidePrompt(context: GuideContext, facts?: PlaceFacts): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are a concise, careful travel guide. You answer in JSON only.\n${RULES}`,
    },
    {
      role: 'user',
      content: `${contextBlock(context)}\n\nChecked facts:\n${factsBlock(facts)}\n\nReturn JSON with exactly these keys:
{"about": "1–2 sentences on what this place is",
 "highlights": ["up to 4 specific things to see or do there"],
 "duration": "typical time spent, e.g. 1–2 hours",
 "bestTime": "when to go, briefly",
 "tips": ["up to 4 practical tips: etiquette, what to bring, booking, crowds"],
 "heads": ["anything about this particular visit that needs attention; empty if none"]}`,
    },
  ];
}

const list = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).slice(0, max) : [];

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** The model's answer, made safe to show: unknown keys dropped, lists capped. */
export function parseGuide(raw: string, now = new Date()): PlaceGuide | null {
  const body = extractJson(raw);
  if (!body) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  const about = text(data.about);
  if (!about) return null;
  return {
    about,
    highlights: list(data.highlights, 4),
    duration: text(data.duration),
    bestTime: text(data.bestTime),
    tips: list(data.tips, 4),
    heads: list(data.heads, 3),
    generatedAt: now.toISOString(),
  };
}

/** Ask for the guide. Throws MissingKeyError with no key, or an Error with a message. */
export async function askPlaceGuide(context: GuideContext, facts?: PlaceFacts): Promise<PlaceGuide> {
  const raw = await streamCompletion(buildGuidePrompt(context, facts), {
    json: true,
    temperature: 0.4,
    maxTokens: 900,
  });
  const guide = parseGuide(raw);
  if (!guide) throw new Error('The AI did not come back with a usable guide. Try again?');
  return guide;
}

/** A short answer to one question about the place, in the same voice and under the same rules. */
export async function askAboutPlace(
  question: string,
  context: GuideContext,
  facts?: PlaceFacts,
): Promise<string> {
  const answer = await streamCompletion(
    [
      {
        role: 'system',
        content: `You are a concise, careful travel guide. Answer in at most 70 words, plain text, no lists unless asked.\n${RULES.replace(/"heads"/g, 'your answer')}`,
      },
      { role: 'user', content: `${contextBlock(context)}\n\nChecked facts:\n${factsBlock(facts)}\n\nQuestion: ${question}` },
    ],
    { temperature: 0.4, maxTokens: 300 },
  );
  return answer.trim();
}
