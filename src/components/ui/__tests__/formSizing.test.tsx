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

  it('has no hand-rolled input padding left in the components', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src/components'))) {
      const src = readFileSync(file, 'utf-8');
      // A bordered, filled control that sets its own padding — the shape the
      // shared constants exist to own.
      const re = /className="[^"]*bg-surface-(raised|overlay)[^"]*border[^"]*px-2 py-1(\.5)?[^"]*"/g;
      if (re.test(src)) offenders.push(file.replace(process.cwd(), ''));
    }
    expect(offenders).toEqual([]);
  });
});
