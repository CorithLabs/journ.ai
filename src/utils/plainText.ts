/**
 * Markdown out of text that was never going to be rendered as markdown.
 *
 * The weather suggestions arrive as prose from a model that writes in
 * markdown by habit, and they were printed straight into a card — so a
 * suggestion read "**Day Swap:** move the *coastal walk* to `Day 4`" with
 * every mark still in it.
 *
 * Stripping is the right move here rather than rendering: these cards show a
 * one-line reason beside pills that carry the actual change, and a heading or
 * a bullet list inside one would fight the card's own structure.
 */
export function stripMarkdown(text: string): string {
  return text
    // Links: keep what was written, drop where it pointed.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Emphasis, in both spellings, innermost first.
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    // Leading list markers, quote marks and headings.
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The reason a suggestion gives, with the part the pills already say removed.
 *
 * "Move the coastal walk to Day 4 — it is dry there" becomes "it is dry
 * there", because the card is about to draw the move as pills and an arrow.
 * Repeating it in prose underneath is noise.
 */
export function suggestionReason(description: string): string {
  const plain = stripMarkdown(description);
  const afterDash = plain.split(/\s[—–-]\s/).slice(1).join(' — ').trim();
  const reason = afterDash || plain;
  // A reason that is only the change restated adds nothing.
  return reason === plain && /^[^.]{0,40}$/.test(plain) ? '' : reason;
}
