import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/render';
import AboutPlace from '../AboutPlace';
import type { Activity } from '../../../db';
import { fetchPlaceFacts } from '../../../services/placeFacts';
import * as guide from '../../../services/placeGuide';
import * as aiKey from '../../../services/aiKey';

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1', name: 'Meiji Shrine', time: 'morning', locationName: 'Shibuya, Tokyo',
  coordinates: [139.6993, 35.6764], notes: '', pinnedToTodo: false, ...over,
});
const plan = {
  destination: 'Tokyo, Japan',
  startDate: '2026-10-11',
  itinerary: [{ dayIndex: 1, label: 'Day 2', activities: [act()] }],
  intake: { numTravellers: 2, kids: false, kidAges: [], likes: ['temples'], dislikes: [], budgetRange: 'mid' as const, flightsBooked: null, accommodationBooked: null },
};
const facts = {
  wiki: { title: 'Meiji Shrine', extract: 'Meiji Shrine is a Shinto shrine in Shibuya, Tokyo.', url: 'https://en.wikipedia.org/wiki/Meiji_Shrine' },
  map: { openingHours: 'sunrise-sunset', fee: 'no', localName: '明治神宮' },
  checkedAt: '2026-10-07T00:00:00.000Z',
};
const sampleGuide = {
  about: 'A forested Shinto shrine dedicated to Emperor Meiji.',
  highlights: ['The great torii gate'],
  duration: '1 hour',
  bestTime: 'Early morning',
  tips: ['Bow once at the gate'],
  heads: ['Rain likely: the gravel paths get muddy'],
  generatedAt: '2026-10-07T00:00:00.000Z',
};

const show = (a = act(), extra: { onSave?: () => void; onAddNote?: () => void } = {}) => {
  const onSave = vi.fn(extra.onSave);
  const onAddNote = vi.fn(extra.onAddNote);
  render(<AboutPlace act={a} plan={plan} onSave={onSave} onAddNote={onAddNote} />);
  return { onSave, onAddNote };
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(aiKey, 'hasStoredKey').mockReturnValue(true);
});

describe('what the sources say', () => {
  it('looks the place up the first time, and keeps what it found', async () => {
    vi.mocked(fetchPlaceFacts).mockResolvedValueOnce(facts);
    const { onSave } = show();
    expect(await screen.findByText(/is a Shinto shrine in Shibuya/)).toBeInTheDocument();
    expect(fetchPlaceFacts).toHaveBeenCalledWith(expect.objectContaining({ name: 'Meiji Shrine', coordinates: [139.6993, 35.6764] }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ facts }));
  });

  it('does not look it up again once it has', () => {
    vi.mocked(fetchPlaceFacts).mockClear();
    show(act({ about: { facts } }));
    expect(fetchPlaceFacts).not.toHaveBeenCalled();
    expect(screen.getByTestId('about-wiki')).toBeInTheDocument();
  });

  it('shows the hours, fee and the name to show a driver', () => {
    show(act({ about: { facts } }));
    expect(screen.getByTestId('about-hours')).toHaveTextContent('Sunrise to sunset');
    const chips = screen.getByTestId('about-map-facts');
    expect(chips).toHaveTextContent('Free');
    expect(chips).toHaveTextContent('明治神宮');
  });

  it('says where the facts come from and to check them', () => {
    show(act({ about: { facts } }));
    expect(screen.getByText(/From Wikipedia and OpenStreetMap\s*, checked .* check before you go/)).toBeInTheDocument();
  });

  it('names only the sources that had something', () => {
    show(act({ about: { facts: { wiki: facts.wiki, checkedAt: facts.checkedAt } } }));
    expect(screen.getByText(/From Wikipedia\s*, checked/)).toBeInTheDocument();
    expect(screen.queryByText(/OpenStreetMap/)).not.toBeInTheDocument();
  });

  const answered = { checkedAt: facts.checkedAt, complete: true, query: 'meiji shrine|shibuya, tokyo|139.699,35.676' };

  it('says plainly when the sources have nothing under that name', async () => {
    vi.mocked(fetchPlaceFacts).mockResolvedValueOnce(answered);
    show();
    expect(await screen.findByTestId('about-nothing')).toHaveTextContent('Wikipedia and OpenStreetMap have nothing under this name.');
  });

  // An empty answer was kept for good, so the Deutsches Museum said "nothing
  // found" long after Wikipedia would have answered.
  it('looks again at a kept empty answer each time it is opened', async () => {
    vi.mocked(fetchPlaceFacts).mockClear();
    vi.mocked(fetchPlaceFacts).mockResolvedValueOnce(facts);
    show(act({ about: { facts: answered } }));
    expect(fetchPlaceFacts).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('about-wiki')).toBeInTheDocument();
  });

  // A timeout is not an answer: the panel must not say "nothing" for it, or keep it.
  it('says it could not reach the sources, and looks again next time', async () => {
    vi.mocked(fetchPlaceFacts).mockClear();
    vi.mocked(fetchPlaceFacts).mockResolvedValueOnce({ checkedAt: facts.checkedAt, complete: false, query: answered.query });
    show(act({ about: { facts: { ...answered, complete: false } } }));
    expect(fetchPlaceFacts).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('about-unreached')).toHaveTextContent('Could not reach Wikipedia or OpenStreetMap');
  });

  it('can be asked to check again', async () => {
    vi.mocked(fetchPlaceFacts).mockClear();
    vi.mocked(fetchPlaceFacts).mockResolvedValueOnce(answered).mockResolvedValueOnce(facts);
    show();
    fireEvent.click(await screen.findByTestId('about-check-again'));
    expect(await screen.findByTestId('about-wiki')).toBeInTheDocument();
  });

  // Saved before lookups recorded whether they were complete: may be a miss.
  it('looks again at an empty answer kept from before', () => {
    vi.mocked(fetchPlaceFacts).mockClear();
    show(act({ about: { facts: { checkedAt: facts.checkedAt } } }));
    expect(fetchPlaceFacts).toHaveBeenCalledTimes(1);
  });

  it('looks again when the stop has been renamed', () => {
    vi.mocked(fetchPlaceFacts).mockClear();
    show(act({ name: 'Munich Residence', about: { facts: answered } }));
    expect(fetchPlaceFacts).toHaveBeenCalledWith(expect.objectContaining({ name: 'Munich Residence' }));
  });
});

// Checked without AI, from the hours: the demo trip had Shinjuku Gyoen on a Monday.
describe('a closed day', () => {
  const gyoen = act({ id: 'g', name: 'Shinjuku Gyoen' });
  const onMonday = { ...plan, itinerary: [{ dayIndex: 1, label: 'Day 2', activities: [gyoen] }] }; // 11 Oct + 1 = Mon 12 Oct
  const withHours = (hours: string) => ({ ...gyoen, about: { facts: { map: { openingHours: hours }, checkedAt: facts.checkedAt } } });

  it('is called out when the place says it is shut that day', () => {
    render(<AboutPlace act={withHours('Mo off; Tu-Su 09:00-16:30')} plan={onMonday} onSave={vi.fn()} onAddNote={vi.fn()} />);
    expect(screen.getByTestId('about-closed')).toHaveTextContent('Closed on Mondays, and it is planned for Mon 12 Oct.');
  });

  it('stays quiet when it is open', () => {
    render(<AboutPlace act={withHours('Tu off; Mo,We-Su 09:00-16:30')} plan={onMonday} onSave={vi.fn()} onAddNote={vi.fn()} />);
    expect(screen.queryByTestId('about-closed')).not.toBeInTheDocument();
  });
});

describe('the AI guide', () => {
  it('is offered, and asked about this visit with the checked facts', async () => {
    const spy = vi.spyOn(guide, 'askPlaceGuide').mockResolvedValue(sampleGuide);
    const { onSave } = show(act({ about: { facts } }));
    fireEvent.click(screen.getByTestId('about-ask-guide'));
    expect(await screen.findByTestId('about-guide')).toHaveTextContent('A forested Shinto shrine');
    const [ctx, given] = spy.mock.calls[0];
    expect(ctx).toMatchObject({ name: 'Meiji Shrine', date: '2026-10-12', when: 'Morning', likes: ['temples'] });
    expect(given).toBe(facts);
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ facts, guide: sampleGuide }));
  });

  // "Nothing found" above an account of the place read as a contradiction:
  // when the sources have nothing, the guide is simply the answer.
  it('is shown on its own when the sources have nothing', async () => {
    const empty = { checkedAt: facts.checkedAt, complete: true, query: 'x' };
    vi.mocked(fetchPlaceFacts).mockResolvedValueOnce(empty);
    show(act({ about: { facts: empty, guide: sampleGuide } }));
    await waitFor(() => expect(screen.queryByTestId('about-loading')).not.toBeInTheDocument());
    expect(screen.getByTestId('about-guide')).toHaveTextContent('A forested Shinto shrine');
    expect(screen.queryByTestId('about-nothing')).not.toBeInTheDocument();
    expect(screen.queryByTestId('about-unreached')).not.toBeInTheDocument();
    expect(screen.queryByText(/No checked source/)).not.toBeInTheDocument();
  });

  it('puts what needs attention first, and says it is AI', () => {
    show(act({ about: { facts, guide: sampleGuide } }));
    expect(screen.getByTestId('about-heads')).toHaveTextContent('Rain likely');
    expect(screen.getByText(/AI guide · may be wrong/)).toBeInTheDocument();
  });

  it('points to Settings when there is no key, and still shows the facts', () => {
    vi.spyOn(aiKey, 'hasStoredKey').mockReturnValue(false);
    show(act({ about: { facts } }));
    expect(screen.getByTestId('about-needs-key')).toBeInTheDocument();
    expect(screen.queryByTestId('about-ask-guide')).not.toBeInTheDocument();
    expect(screen.getByTestId('about-wiki')).toBeInTheDocument();
  });

  it('says what went wrong', async () => {
    vi.spyOn(guide, 'askPlaceGuide').mockRejectedValue(new Error('Rate limited — try again in a minute.'));
    show(act({ about: { facts } }));
    fireEvent.click(screen.getByTestId('about-ask-guide'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rate limited');
  });
});

describe('asking more', () => {
  it('answers a question and can keep the answer in the notes', async () => {
    vi.spyOn(guide, 'askAboutPlace').mockResolvedValue('Yes — wide paths and a big open forest.');
    const { onAddNote } = show(act({ about: { facts, guide: sampleGuide } }));
    fireEvent.click(screen.getByRole('button', { name: 'Good for kids?' }));
    expect(await screen.findByText(/wide paths/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('about-save-answer'));
    expect(onAddNote).toHaveBeenCalledWith('Good for kids? Yes — wide paths and a big open forest.');
    await waitFor(() => expect(screen.getByTestId('about-save-answer')).toHaveTextContent('Added to notes'));
  });
});
