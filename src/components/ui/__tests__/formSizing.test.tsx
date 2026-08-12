import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/render';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ActivityCard from '../../itinerary/ActivityCard';
import { fieldClass, fieldOnCard, notesClass } from '../formStyles';
import type { Activity } from '../../../db';

const act: Activity = {
  id: 'a1', name: 'Dinner', time: 'evening', locationName: 'Shibuya',
  notes: 'A note', pinnedToTodo: false,
};
const plan = { destination: 'Tokyo', country: 'Japan' };
const noop = () => {};

/*
 * Reading and editing want opposite widths, and every CRUD dialog in the app
 * used the same one — so reading was right by accident and editing was cramped
 * by the same decision.
 */
describe('the room a dialog gives its job', () => {
  const openDetail = () => {
    render(<ActivityCard act={act} plan={plan} onDel={noop} onUpd={vi.fn()} onPin={noop} />);
    fireEvent.click(screen.getByTestId('activity-card-body'));
  };

  it('keeps the reading view at a narrow measure, where prose belongs', () => {
    openDetail();
    expect(screen.getByTestId('modal').className).toContain('max-w-md');
  });

  it('widens once there is a form in it', () => {
    openDetail();
    fireEvent.click(screen.getByTestId('detail-edit'));
    expect(screen.getByTestId('modal').className).toContain('max-w-2xl');
  });

  it('narrows again on the way back to reading', () => {
    openDetail();
    fireEvent.click(screen.getByTestId('detail-edit'));
    fireEvent.click(screen.getByTestId('activity-cancel-btn'));
    fireEvent.click(screen.getByTestId('activity-card-body'));
    expect(screen.getByTestId('modal').className).toContain('max-w-md');
  });
});

describe('the shared field metrics', () => {
  // The smallest of the five came out about 28px tall, under the 44px a finger
  // needs. py-2 on text-sm clears it.
  it('sizes every field to something a finger can hit', () => {
    for (const cls of [fieldClass, fieldOnCard]) {
      expect(cls).toContain('px-3');
      expect(cls).toContain('py-2');
    }
  });

  // The two grounds are the one thing that genuinely differs: a field has to
  // be a step away from whatever is behind it, and dialogs and cards sit on
  // opposite sides of the same input.
  it('keeps one shape across both grounds', () => {
    const shapeOf = (c: string) => c.replace(/bg-surface-\w+\s*/, '');
    expect(shapeOf(fieldClass)).toBe(shapeOf(fieldOnCard));
    expect(fieldClass).toContain('bg-surface-raised');
    expect(fieldOnCard).toContain('bg-surface-overlay');
  });

  // Whatever height is picked here, the person writing the note knows better.
  it('lets a notes box be dragged larger', () => {
    expect(notesClass).toContain('resize-y');
    expect(notesClass).not.toContain('resize-none');
  });
});

/*
 * A guard, not a style opinion: the five sizes arrived one form at a time,
 * each reasonable on its own, and nothing in the suite could see them.
 */
describe('no form control goes back to its own size', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full);
      return e.name.endsWith('.tsx') ? [full] : [];
    });

  const sources = () =>
    [join(process.cwd(), 'src/components'), join(process.cwd(), 'src/pages')]
      .flatMap(walk)
      .map((file) => [file.replace(process.cwd(), ''), readFileSync(file, 'utf-8')] as const);

  const offendersFor = (re: RegExp) =>
    sources().filter(([, src]) => new RegExp(re.source, 'g').test(src)).map(([name]) => name);

  // A bordered, filled control that sets its own padding — the shape the
  // shared constants exist to own.
  const OWN_PADDING = /className="[^"]*bg-surface-(raised|overlay)[^"]*border[^"]*px-2 py-1(\.5)?[^"]*"/;

  /*
   * The other way the five sizes arrived: not a different size, but the right
   * one written out again. Three copies of the house field had accumulated —
   * two named constants and one longhand — and a copy is where the next size
   * comes from.
   */
  const RESPELT = /className="[^"]*bg-surface-(raised|overlay)[^"]*border[^"]*rounded-xl px-3 py-2[^"]*"/;

  it('has no hand-rolled input padding left', () => {
    expect(offendersFor(OWN_PADDING)).toEqual([]);
  });

  it('has nobody re-spelling the shared field instead of importing it', () => {
    expect(offendersFor(RESPELT)).toEqual([]);
  });

  // A guard nothing can trip is not a guard.
  it('would catch either of them coming back', () => {
    const ownPadding =
      'className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm"';
    const respelt =
      'className="w-full bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm"';
    expect(OWN_PADDING.test(ownPadding)).toBe(true);
    expect(RESPELT.test(respelt)).toBe(true);
  });
});
