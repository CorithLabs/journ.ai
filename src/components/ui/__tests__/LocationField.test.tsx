import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '../../../test/render';
import { useState } from 'react';
import LocationField, { type PickedLocation } from '../LocationField';
import * as venues from '../../../services/venues';

const SHIBUYA: [number, number] = [139.7016, 35.658];

const ICHIRAN = {
  name: 'Ichiran',
  address: 'Ichiran, 1-22-7 Jinnan, Shibuya, Tokyo',
  coordinates: SHIBUYA,
};

/** The field is controlled, so the test has to hold its value like its host. */
function Host({ onPick }: { onPick?: (p: PickedLocation) => void }) {
  const [loc, setLoc] = useState<PickedLocation>({ locationName: '' });
  return (
    <LocationField
      value={loc.locationName}
      address={loc.address}
      onChange={(next) => { setLoc(next); onPick?.(next); }}
      context="Tokyo, Japan"
    />
  );
}

const type = async (text: string) => {
  fireEvent.change(screen.getByTestId('location-field'), { target: { value: text } });
  // Past the debounce.
  await act(async () => { vi.advanceTimersByTime(400); });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(venues, 'searchVenues').mockResolvedValue([ICHIRAN]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('picking a venue instead of describing one', () => {
  it('offers venues once there is enough to search on', async () => {
    render(<Host />);
    await type('Ichiran');

    await waitFor(() => expect(screen.getByTestId('location-field-suggestions')).toBeInTheDocument());
    expect(screen.getByTestId('location-field-option-0')).toHaveTextContent('Ichiran');
    expect(screen.getByTestId('location-field-option-0')).toHaveTextContent('1-22-7 Jinnan');
  });

  it('does not search on a fragment too short to mean anything', async () => {
    render(<Host />);
    await type('I');
    expect(venues.searchVenues).not.toHaveBeenCalled();
  });

  /*
   * The whole point: the coordinates come from the choice, so nothing has to
   * be guessed at later. Left to the geocoder, "Ichiran" is one of eighty.
   */
  it('takes the coordinates and address from the venue that was chosen', async () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await type('Ichiran');
    await waitFor(() => screen.getByTestId('location-field-option-0'));

    fireEvent.mouseDown(screen.getByTestId('location-field-option-0'));

    expect(onPick).toHaveBeenLastCalledWith({
      locationName: 'Ichiran',
      address: ICHIRAN.address,
      coordinates: SHIBUYA,
    });
  });

  it('closes the list once something has been picked from it', async () => {
    render(<Host />);
    await type('Ichiran');
    await waitFor(() => screen.getByTestId('location-field-option-0'));

    fireEvent.mouseDown(screen.getByTestId('location-field-option-0'));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(screen.queryByTestId('location-field-suggestions')).not.toBeInTheDocument();
  });

  it('shows what the coordinates point at, so a wrong match is visible', async () => {
    render(<Host />);
    await type('Ichiran');
    await waitFor(() => screen.getByTestId('location-field-option-0'));

    fireEvent.mouseDown(screen.getByTestId('location-field-option-0'));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(screen.getByTestId('location-field-address')).toHaveTextContent('1-22-7 Jinnan');
  });

  /*
   * The resolved position belongs to the text it was resolved from. Keeping it
   * across an edit left the card naming one place and drawn at another, with
   * nothing on the card to show the two had come apart.
   */
  it('lets go of the coordinates when the location is typed over', async () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await type('Ichiran');
    await waitFor(() => screen.getByTestId('location-field-option-0'));
    fireEvent.mouseDown(screen.getByTestId('location-field-option-0'));

    fireEvent.change(screen.getByTestId('location-field'), { target: { value: 'Asakusa' } });

    expect(onPick).toHaveBeenLastCalledWith({ locationName: 'Asakusa' });
  });

  it('picks the highlighted venue on Enter', async () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await type('Ichiran');
    await waitFor(() => screen.getByTestId('location-field-option-0'));

    const input = screen.getByTestId('location-field');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ coordinates: SHIBUYA }));
  });

  // Enter has to keep submitting the form the rest of the time, or the field
  // swallows the way every other one is completed.
  it('leaves Enter alone when nothing is highlighted', async () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await type('Ichiran');
    await waitFor(() => screen.getByTestId('location-field-option-0'));

    const evt = fireEvent.keyDown(screen.getByTestId('location-field'), { key: 'Enter' });

    expect(evt).toBe(true); // not prevented
    expect(onPick).not.toHaveBeenCalledWith(expect.objectContaining({ coordinates: SHIBUYA }));
  });
});

describe('when there are no venues to offer', () => {
  it('stays an ordinary text field', async () => {
    vi.mocked(venues.searchVenues).mockResolvedValue([]);
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    await type('Somewhere nobody has mapped');

    expect(screen.queryByTestId('location-field-suggestions')).not.toBeInTheDocument();
    expect(onPick).toHaveBeenLastCalledWith({ locationName: 'Somewhere nobody has mapped' });
  });
});
