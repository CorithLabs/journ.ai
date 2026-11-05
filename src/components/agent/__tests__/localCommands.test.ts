import { describe, it, expect } from 'vitest';
import { parseLocalCommand } from '../localCommands';

// Requests whose words say exactly what to do run without the AI.
describe('commands the app carries out itself', () => {
  it.each(['undo', 'Undo that', 'undo last change'])('reads "%s" as undo', (t) => {
    expect(parseLocalCommand(t)).toEqual({ kind: 'undo' });
  });

  it('reads a swap across days', () => {
    expect(parseLocalCommand('swap the museum on day 1 with Tsukiji Market on day 2')).toEqual({
      kind: 'action', name: 'swap_activities',
      args: { nameA: 'museum', dayA: 0, nameB: 'Tsukiji Market', dayB: 1 },
    });
  });

  it('reads a swap without days', () => {
    expect(parseLocalCommand('Swap lunch and the temple')).toMatchObject({ args: { nameA: 'lunch', nameB: 'temple' } });
  });

  it('reads a move to a day and part of the day', () => {
    expect(parseLocalCommand('move lunch to day 2 evening')).toMatchObject({
      name: 'move_activity', args: { nameMatch: 'lunch', toDayIndex: 1, time: 'evening' },
    });
    expect(parseLocalCommand('move the temple to the morning')).toMatchObject({
      name: 'move_activity', args: { nameMatch: 'temple', time: 'morning' },
    });
  });

  it('reads a removal, falling back to a to-do of that name', () => {
    expect(parseLocalCommand('delete the robot show')).toMatchObject({
      name: 'remove_activity', args: { nameMatch: 'robot show' },
      fallback: { name: 'remove_todo', args: { titleMatch: 'robot show' } },
    });
  });

  it('reads ticking something off', () => {
    expect(parseLocalCommand('mark the train tickets as done')).toMatchObject({ name: 'complete_todo', args: { titleMatch: 'train tickets' } });
    expect(parseLocalCommand('tick off travel insurance')).toMatchObject({ args: { titleMatch: 'travel insurance' } });
  });

  // The briefing's pills say exactly this.
  it('reads adding a to-do, packing ones as Packing', () => {
    expect(parseLocalCommand('Add to-do: Pack an umbrella or rain jacket')).toEqual({
      kind: 'action', name: 'add_todo', args: { title: 'Pack an umbrella or rain jacket', category: 'Packing' },
    });
  });

  it.each(['plan a day of temples', 'what is the weather like?', 'add some lunch spots on day 2'])(
    'leaves "%s" to the AI', (t) => {
      expect(parseLocalCommand(t)).toBeNull();
    },
  );
});
