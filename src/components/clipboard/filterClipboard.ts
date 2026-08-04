import type { ClipboardItem } from '../../db';
import type { ClipboardType } from './clipboardConstants';

/** The special "All" filter value used by the type filter chips. */
export const ALL_FILTER = 'All' as const;
export type TypeFilter = typeof ALL_FILTER | ClipboardType;

/**
 * Pure, synchronous filter for clipboard items.
 * - `query` is matched as PLAIN TEXT (case-insensitive) against title + body.
 *   Special characters (e.g. "hotel@tokyo.jp") are treated literally — no regex.
 * - `type` narrows to a single clipboard type, or ALL for no type restriction.
 *
 * Designed to run in well under 100ms for 200+ items (single linear pass,
 * lower-cased query computed once).
 */
export function filterClipboard(
  items: ClipboardItem[],
  query: string,
  type: TypeFilter,
): ClipboardItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (type !== ALL_FILTER && item.type !== type) return false;
    if (!q) return true;
    const haystack = `${item.title} ${item.body ?? ''} ${item.fileName ?? ''}`.toLowerCase();
    return haystack.includes(q);
  });
}
