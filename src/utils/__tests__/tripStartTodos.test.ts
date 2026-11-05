import { describe, it, expect } from 'vitest';
import { tripStartTodos, travelBasics, BOOK_STAY, SAVE_STAY } from '../tripStartTodos';

const BASICS = ['Pack a universal plug adapter', 'Set up an eSIM for data', 'Pack headache medicine', 'Charge and pack a power bank'];
// The trip's own to-dos, without the travel basics every trip gets after them.
const titles = (args: Parameters<typeof tripStartTodos>[1]) =>
  tripStartTodos('p1', args).map((t) => t.title).filter((t) => !BASICS.includes(t));

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

// What people forget, as packing to-dos on every new trip.
describe('travel basics', () => {
  it('come with every new trip', () => {
    const all = tripStartTodos('p1', { mode: 'flight', destination: 'Tokyo', ticketsBooked: true, stayBooked: true, international: true });
    expect(all.map((t) => t.title)).toEqual(expect.arrayContaining(BASICS));
    expect(all.filter((t) => BASICS.includes(t.title)).every((t) => t.category === 'Packing')).toBe(true);
  });

  // A plug adapter and an eSIM are for another country.
  it('leave out the abroad-only ones for a trip known to stay in one country', () => {
    expect(travelBasics('p1', false).map((t) => t.title)).toEqual(['Pack headache medicine', 'Charge and pack a power bank']);
  });

  it('include them when it is not known', () => {
    expect(travelBasics('p1', null)).toHaveLength(4);
  });
});
