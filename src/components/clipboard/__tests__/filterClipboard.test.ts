import { describe, it, expect } from 'vitest';
import { filterClipboard, ALL_FILTER } from '../filterClipboard';
import type { ClipboardItem } from '../../../db';

function make(partial: Partial<ClipboardItem> & { id: string }): ClipboardItem {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    planId: 'plan-1',
    type: partial.type ?? 'Note',
    title: partial.title ?? 'Untitled',
    body: partial.body,
    fileName: partial.fileName,
    createdAt: now,
    updatedAt: now,
  };
}

const items: ClipboardItem[] = [
  make({ id: '1', type: 'Hotel', title: 'Park Hyatt Tokyo', body: 'Confirmation #ABC123' }),
  make({ id: '2', type: 'Email', title: 'Airline', body: 'contact hotel@tokyo.jp for changes' }),
  make({ id: '3', type: 'Boarding Pass', title: 'JAL flight', fileName: 'boarding.pdf' }),
  make({ id: '4', type: 'Note', title: 'Packing list', body: 'Adapters, umbrella' }),
];

describe('filterClipboard', () => {
  it('returns all items with empty query and ALL filter', () => {
    expect(filterClipboard(items, '', ALL_FILTER)).toHaveLength(4);
  });

  it('matches against title (case-insensitive)', () => {
    const res = filterClipboard(items, 'park hyatt', ALL_FILTER);
    expect(res.map((i) => i.id)).toEqual(['1']);
  });

  it('matches against body text', () => {
    const res = filterClipboard(items, 'umbrella', ALL_FILTER);
    expect(res.map((i) => i.id)).toEqual(['4']);
  });

  it('matches against file name', () => {
    const res = filterClipboard(items, 'boarding.pdf', ALL_FILTER);
    expect(res.map((i) => i.id)).toEqual(['3']);
  });

  it('treats special characters as plain text (no regex errors)', () => {
    const res = filterClipboard(items, 'hotel@tokyo.jp', ALL_FILTER);
    expect(res.map((i) => i.id)).toEqual(['2']);
  });

  it('does not throw on regex metacharacters', () => {
    expect(() => filterClipboard(items, '(*.+[', ALL_FILTER)).not.toThrow();
    expect(filterClipboard(items, '(*.+[', ALL_FILTER)).toHaveLength(0);
  });

  it('narrows by type filter', () => {
    const res = filterClipboard(items, '', 'Hotel');
    expect(res.map((i) => i.id)).toEqual(['1']);
  });

  it('combines type filter with search query', () => {
    // "Airline" is Email; searching "flight" under Email should return nothing
    expect(filterClipboard(items, 'flight', 'Email')).toHaveLength(0);
    // Searching "flight" under Boarding Pass returns the JAL item
    expect(filterClipboard(items, 'flight', 'Boarding Pass').map((i) => i.id)).toEqual(['3']);
  });

  it('filters a large clipboard (250 items) quickly and correctly', () => {
    const big: ClipboardItem[] = Array.from({ length: 250 }, (_, n) =>
      make({ id: `big-${n}`, title: n === 123 ? 'unique-target' : `Item ${n}` }),
    );
    const start = performance.now();
    const res = filterClipboard(big, 'unique-target', ALL_FILTER);
    const elapsed = performance.now() - start;
    expect(res).toHaveLength(1);
    expect(elapsed).toBeLessThan(100);
  });
});
