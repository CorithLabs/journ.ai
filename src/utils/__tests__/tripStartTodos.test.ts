import { describe, it, expect } from 'vitest';
import { tripStartTodos, BOOK_STAY, SAVE_STAY } from '../tripStartTodos';

const titles = (args: Parameters<typeof tripStartTodos>[1]) => tripStartTodos('p1', args).map((t) => t.title);

describe('what Essentials holds for a new trip', () => {
  it('asks to book what is not booked', () => {
    expect(titles({ mode: 'flight', destination: 'Tokyo, Japan', ticketsBooked: false, stayBooked: false }))
      .toEqual(['Book flights to Tokyo, Japan', BOOK_STAY]);
  });

  // Booked tickets need somewhere to live; Attach proof finishes the task.
  it('gives booked tickets and a booked stay a place to be saved', () => {
    expect(titles({ mode: 'train', destination: 'Montreal', ticketsBooked: true, stayBooked: true }))
      .toEqual(['Save your train tickets', SAVE_STAY]);
  });

  // The hotel question can be skipped; unanswered means still to do.
  it('treats an unanswered stay as not booked', () => {
    expect(titles({ mode: 'flight', destination: 'Tokyo', ticketsBooked: true, stayBooked: null })).toContain(BOOK_STAY);
  });

  it('has nothing to book for a road trip', () => {
    expect(titles({ mode: 'car', destination: 'Ottawa', ticketsBooked: false, stayBooked: true })).toEqual([SAVE_STAY]);
  });

  // Same wording as the to-dos made after the intake, which dedupes by title.
  it('words the stay task like the intake does', () => {
    expect(BOOK_STAY).toBe('Book accommodation for each night');
  });
});
