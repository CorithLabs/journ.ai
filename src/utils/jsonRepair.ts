/**
 * Salvaging JSON a model got slightly wrong.
 *
 * Even told to emit nothing but JSON, models produce two failures often enough
 * to be worth handling rather than reporting:
 *
 *   - A closer in the wrong place. A real itinerary arrived with a day ending
 *     `...}]}},{"dayIndex":6` — the day object closed twice, so the whole
 *     eight-day response was unreadable over one character.
 *   - A response that stops mid-structure, because the model ran into its
 *     output cap. Everything up to that point is perfectly good.
 *
 * Both are recoverable without asking the model again, which costs a round
 * trip and can fail the same way. This is deliberately not a JSON parser: it
 * only balances containers, and whatever it produces is still handed to
 * JSON.parse, which has the final say.
 */

/** The first balanced JSON value in `text`, repaired if need be. */
export function extractJson(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  return repairJson(text.slice(start));
}

export function repairJson(text: string): string {
  const stack: string[] = [];
  let out = '';
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }

    if (c === '{' || c === '[') {
      stack.push(c === '{' ? '}' : ']');
      out += c;
      continue;
    }

    if (c === '}' || c === ']') {
      // A closer that does not match the innermost open container is the
      // model's slip, not a structure — dropping it keeps everything after it,
      // where truncating would silently lose the rest of the trip.
      if (stack[stack.length - 1] !== c) continue;
      stack.pop();
      out += c;
      // Everything after the outermost value is prose, a second object, or
      // whatever else the model added; none of it is ours.
      if (stack.length === 0) {
        end = i;
        break;
      }
      continue;
    }

    out += c;
  }

  if (end >= 0) return out;

  // Ran out of text with containers still open: the response was cut off.
  // A dangling key or comma cannot be closed into anything valid, so drop
  // back to the last point that can be.
  if (inString) out = out.slice(0, out.lastIndexOf('"'));
  out = out.replace(/[\s,]*$/, '');
  out = out.replace(/,?\s*"[^"]*"\s*:\s*$/, '');

  while (stack.length) out += stack.pop();
  return out;
}
