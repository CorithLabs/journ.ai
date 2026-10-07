import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GeneratingTrip, { readProgress } from '../GeneratingTrip';

// Half an itinerary, as it arrives from the AI.
const partial =
  '{"days":[{"dayIndex":0,"label":"Day 1","activities":[{"name":"Senso-ji Temple","time":"morning"},' +
  '{"name":"Ueno Park","time":"noon"}]},{"dayIndex":1,"label":"Day 2","activities":[{"name":"Meiji Shr';

describe('reading progress from a half-written itinerary', () => {
  it('counts the days begun and the stops already named', () => {
    expect(readProgress(partial)).toEqual({ days: 2, stops: ['Senso-ji Temple', 'Ueno Park'] });
  });

  it('reads nothing from nothing', () => {
    expect(readProgress('')).toEqual({ days: 0, stops: [] });
  });
});

/*
 * The wait used to be a spinner and a scroll of raw JSON. It now shows the
 * plan taking shape: which day, which stops, how far along.
 */
describe('the wait while the trip is written', () => {
  it('starts by saying what it is doing', () => {
    render(<GeneratingTrip text="" totalDays={4} />);
    expect(screen.getByTestId('generating-headline')).toHaveTextContent('Reading your preferences');
    expect(screen.queryByTestId('generating-stops')).not.toBeInTheDocument();
  });

  it('says which day it is on, and names the stops as they come', () => {
    render(<GeneratingTrip text={partial} totalDays={4} />);
    expect(screen.getByTestId('generating-headline')).toHaveTextContent('Planning day 2 of 4');
    expect(screen.getByTestId('generating-stops')).toHaveTextContent('Ueno Park');
    expect(screen.getByText('2 stops so far')).toBeInTheDocument();
  });

  it('drops a pin for each stop', () => {
    const { container } = render(<GeneratingTrip text={partial} totalDays={4} />);
    expect(container.querySelectorAll('.fill-accent').length).toBeGreaterThanOrEqual(2);
  });

  it('says when it is fixing the answer rather than writing it', () => {
    render(<GeneratingTrip text={partial} totalDays={4} repairing />);
    expect(screen.getByTestId('generating-headline')).toHaveTextContent('Tidying up');
  });

  it('is announced politely to screen readers', () => {
    render(<GeneratingTrip text="" totalDays={4} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
