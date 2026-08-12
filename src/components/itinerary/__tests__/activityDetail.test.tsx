import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/render';
import ActivityCard from '../ActivityCard';
import type { Activity } from '../../../db';

const LONG_NOTE =
  'Booking reference JX8821. Ask for the counter seats by the window. ' +
  'They stop seating at 21:00 sharp and the queue outside is not the real ' +
  'queue — the ticket machine inside is. Bring cash; the card reader has ' +
  'been broken since spring.';

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  name: 'Dinner at Ichiran',
  time: '19:30',
  locationName: 'Ichiran',
  address: 'Ichiran, 1-22-7 Jinnan, Shibuya, Tokyo',
  coordinates: [139.7016, 35.658],
  notes: LONG_NOTE,
  pinnedToTodo: false,
  ...over,
});

const plan = { destination: 'Tokyo', country: 'Japan' };
const noop = () => {};

const mount = (over: Partial<Activity> = {}, handlers: Partial<{ onDel: () => void }> = {}) =>
  render(
    <ActivityCard act={act(over)} plan={plan} onDel={handlers.onDel ?? noop} onUpd={noop} onPin={noop} />,
  );

/*
 * A card in a list has to stay a card: notes clamp to three lines and the
 * resolved address has nowhere to sit. That is the right trade for scanning,
 * but it left details written down and then unreachable — the only way back to
 * them was to open the editor and read the form.
 */
describe('opening a card', () => {
  it('shows everything the card had to leave out', () => {
    mount();

    fireEvent.click(screen.getByTestId('activity-card-body'));

    const detail = screen.getByTestId('activity-detail');
    expect(detail).toHaveTextContent(LONG_NOTE);
    expect(detail).toHaveTextContent('1-22-7 Jinnan');
    expect(detail).toHaveTextContent('Evening');
    expect(detail).toHaveTextContent('7:30 PM');
  });

  it('opens on the keyboard as well as under a finger', () => {
    mount();

    fireEvent.keyDown(screen.getByTestId('activity-card-body'), { key: 'Enter' });

    expect(screen.getByTestId('activity-detail')).toBeInTheDocument();
  });

  it('says so plainly when there is no location rather than leaving a gap', () => {
    mount({ locationName: '', address: undefined, coordinates: undefined });

    fireEvent.click(screen.getByTestId('activity-card-body'));

    expect(screen.getByTestId('activity-detail')).toHaveTextContent('Not set');
  });

  it('leaves out a section the activity has nothing for', () => {
    mount({ notes: '' });

    fireEvent.click(screen.getByTestId('activity-card-body'));

    expect(screen.queryByTestId('detail-notes')).not.toBeInTheDocument();
  });
});

/*
 * A detail view that can be read but not acted on sends you back to the list to
 * do the thing you just decided to do.
 */
describe('acting on what you just read', () => {
  it('goes on to edit in the same modal', () => {
    mount();
    fireEvent.click(screen.getByTestId('activity-card-body'));

    fireEvent.click(screen.getByTestId('detail-edit'));

    expect(screen.getByTestId('activity-edit-form')).toBeInTheDocument();
    expect(screen.getByLabelText('Activity name')).toHaveValue('Dinner at Ichiran');
  });

  it('offers the map when the activity has somewhere to point at', () => {
    mount();
    fireEvent.click(screen.getByTestId('activity-card-body'));

    expect(screen.getByTestId('detail-map')).toHaveAttribute('href', expect.stringContaining('google'));
  });

  it('offers no map for an activity with nowhere to go', () => {
    mount({ locationName: '', address: undefined, coordinates: undefined });
    fireEvent.click(screen.getByTestId('activity-card-body'));

    expect(screen.queryByTestId('detail-map')).not.toBeInTheDocument();
  });

  // Leaving the modal open over a card that no longer exists would be a view
  // of nothing.
  it('closes when the activity is deleted from it', () => {
    const onDel = vi.fn();
    mount({}, { onDel });
    fireEvent.click(screen.getByTestId('activity-card-body'));

    fireEvent.click(screen.getByTestId('detail-delete'));

    expect(onDel).toHaveBeenCalled();
    expect(screen.queryByTestId('activity-detail')).not.toBeInTheDocument();
  });
});

describe('the edit route', () => {
  it('opens straight into the editor from the pencil', () => {
    mount();

    fireEvent.click(screen.getByLabelText('Edit activity'));

    expect(screen.getByTestId('activity-edit-form')).toBeInTheDocument();
  });

  /*
   * The flag is a control of its own inside a card that is now itself
   * tappable. Without stopping the bubble it opens the reading view — the one
   * place that does not have the field it is about.
   */
  it('takes the map flag straight to the location, not to the reading view', () => {
    mount({
      locationName: 'somewhere downtown',
      coordinates: undefined,
      address: undefined,
      locationUnresolved: true,
    });

    fireEvent.click(screen.getByTestId('map-gap-flag'));

    expect(screen.getByTestId('activity-edit-form')).toBeInTheDocument();
    expect(screen.getByTestId('edit-location')).toHaveFocus();
  });
});
