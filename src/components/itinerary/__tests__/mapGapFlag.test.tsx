import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/render';
import ActivityCard, { mapGapFor } from '../ActivityCard';
import type { Activity } from '../../../db';

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  name: 'Lunch',
  time: 'noon',
  locationName: '',
  notes: '',
  pinnedToTodo: false,
  ...over,
});

const plan = { destination: 'Tokyo', country: 'Japan' };

/*
 * Geocoding runs when the Map tab is opened, so a card with no coordinates has
 * usually just not been looked at yet. Flagging that would tell someone their
 * whole freshly generated itinerary was broken before they had opened it once.
 */
describe('deciding whether a card is missing from the map', () => {
  it('says nothing about a card that is on the map', () => {
    expect(mapGapFor(act({ locationName: 'Shibuya', coordinates: [139.7, 35.6] }))).toBeNull();
  });

  it('says nothing about a card nothing has looked up yet', () => {
    expect(mapGapFor(act({ locationName: 'Shibuya' }))).toBeNull();
    expect(mapGapFor(act({ locationName: '' }))).toBeNull();
  });

  // The two failures need different repairs, which is why they are not one
  // badge: one is missing a location, the other has one no map knows.
  it('asks for a location when none was ever given', () => {
    expect(mapGapFor(act({ locationName: '', locationUnresolved: true }))).toMatchObject({
      kind: 'missing',
      tone: 'muted',
    });
  });

  it('reports a location that was looked for and not found', () => {
    expect(mapGapFor(act({ locationName: 'downtown', locationUnresolved: true }))).toMatchObject({
      kind: 'unresolved',
      tone: 'warning',
    });
  });

  // A stale flag on a card that has since resolved would be worse than none.
  it('drops the flag once coordinates arrive', () => {
    expect(mapGapFor(act({
      locationName: 'downtown',
      locationUnresolved: true,
      coordinates: [139.7, 35.6],
    }))).toBeNull();
  });
});

describe('the flag on the card', () => {
  const noop = () => {};

  it('stays off a card that is on the map', () => {
    render(
      <ActivityCard act={act({ locationName: 'Shibuya', coordinates: [139.7, 35.6] })}
        plan={plan} onDel={noop} onUpd={noop} onPin={noop} />,
    );
    expect(screen.queryByTestId('map-gap-flag')).not.toBeInTheDocument();
  });

  it('appears on a card that could not be placed', () => {
    render(
      <ActivityCard act={act({ locationName: 'downtown', locationUnresolved: true })}
        plan={plan} onDel={noop} onUpd={noop} onPin={noop} />,
    );
    const flag = screen.getByTestId('map-gap-flag');
    expect(flag).toHaveAttribute('data-gap', 'unresolved');
    expect(flag).toHaveTextContent('Location not found');
  });

  /*
   * The flag is the repair, not a report of one needed. A badge that only
   * named the problem would leave the user to go and find the field it was
   * about — which is the same work they were already not doing.
   */
  it('opens the location field when tapped', () => {
    render(
      <ActivityCard act={act({ locationName: '', locationUnresolved: true })}
        plan={plan} onDel={noop} onUpd={vi.fn()} onPin={noop} />,
    );

    fireEvent.click(screen.getByTestId('map-gap-flag'));

    expect(screen.getByTestId('edit-location')).toHaveFocus();
  });
});
