import { Check, Minus } from 'lucide-react';

/**
 * What this app is, and what it is not.
 *
 * The second list is the one that matters. Every claim in it is a thing a
 * traveller could reasonably assume a travel app does — book something, know
 * the visa rules, keep a backup — and being wrong about any of them costs
 * more than the app is worth. Saying so plainly at the start is cheaper than
 * an apology later.
 *
 * Shown as the first screen of the introduction and again in Settings, from
 * one definition so the two cannot disagree.
 */

const IS = [
  'A trip planner that works in parts of the day — Morning, Noon, Evening, Night — rather than a clock you have to keep defending.',
  'Yours alone. Trips live in this browser and any API keys are encrypted here. There is no account and no server holding them.',
  'Bring your own key. You pay OpenAI or Anthropic, and Mapbox, directly and at cost — or use neither and plan by hand.',
  'Both ways round. The AI can draft a whole trip and change it on request; every part of it can also be built by hand.',
  'One place per trip: the itinerary, a to-do list, a clipboard for confirmations, and a map.',
];

const IS_NOT = [
  'Not a booking site. It never buys anything, never sees a card, and never checks prices or availability.',
  'Not an authority on entry rules. It reminds you to check visas and requirements; it does not know them.',
  'Not a live service. No flight status, no delays, no real-time transit or prices.',
  'Not backed up. Clearing this browser’s data deletes your trips, and there is no account to restore them from.',
  'Not shared. One person, one device — there is no sync and no collaboration.',
  'Not always right. The AI drafts; opening hours, closures and prices are yours to confirm.',
];

export default function AboutJournai() {
  return (
    <div className="space-y-4" data-testid="about-journai">
      <section>
        <h3 className="text-sm font-semibold text-ink-primary mb-2">What Journ.ai is</h3>
        <ul className="space-y-1.5">
          {IS.map((line) => (
            <li key={line} className="flex gap-2 text-xs text-ink-secondary leading-relaxed">
              <Check size={13} className="text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ink-primary mb-2">What Journ.ai is not</h3>
        <ul className="space-y-1.5">
          {IS_NOT.map((line) => (
            <li key={line} className="flex gap-2 text-xs text-ink-secondary leading-relaxed">
              <Minus size={13} className="text-ink-muted shrink-0 mt-0.5" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
