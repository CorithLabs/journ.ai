import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cachedPlacePhoto, fetchPlacePhoto, photoCandidates, pickImage } from '../placePhoto';

const summary = (over: Record<string, unknown> = {}) => ({
  type: 'standard',
  title: 'Tokyo',
  originalimage: {
    source: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Shinjuku.jpg',
    width: 2560,
    height: 1364,
  },
  thumbnail: {
    source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Shinjuku.jpg/330px-Shinjuku.jpg?utm_source=x',
    width: 330,
    height: 176,
  },
  content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Tokyo' } },
  ...over,
});

const respond = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('choosing the image', () => {
  // The original can be 5000px wide. The thumbnail path serves any width.
  it('asks for a sensible width rather than the original', () => {
    expect(pickImage(summary())).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Shinjuku.jpg/1280px-Shinjuku.jpg',
    );
  });

  it('uses the original when it is already small enough', () => {
    expect(pickImage(summary({ originalimage: { source: 'https://x/a.jpg', width: 1000, height: 700 } }))).toBe('https://x/a.jpg');
  });

  // Maps, flags and coats of arms are the commonest lead images that are not
  // a view of the place.
  it('refuses an SVG', () => {
    expect(pickImage(summary({ originalimage: { source: 'https://x/Flag.svg', width: 2000, height: 1000 } }))).toBeNull();
  });

  it('refuses an image too small to fill the panel', () => {
    expect(pickImage(summary({ originalimage: { source: 'https://x/a.jpg', width: 320, height: 200 } }))).toBeNull();
  });

  it('has nothing to offer for an article with no image', () => {
    expect(pickImage(summary({ originalimage: undefined }))).toBeNull();
  });
});

describe('looking a place up', () => {
  it('tries the full name before the bare city', () => {
    expect(photoCandidates('Banff, Alberta')).toEqual(['Banff, Alberta', 'Banff']);
    expect(photoCandidates('Tokyo')).toEqual(['Tokyo']);
  });

  it('falls back to the bare city when the full name is not an article', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => respond({}, false))
      .mockImplementationOnce(() => respond(summary()));
    vi.stubGlobal('fetch', fetchMock);

    const photo = await fetchPlacePhoto('Tokyo, Japan');
    expect(photo?.pageUrl).toBe('https://en.wikipedia.org/wiki/Tokyo');
    expect(fetchMock.mock.calls[0][0]).toContain('Tokyo%2C_Japan');
    expect(fetchMock.mock.calls[1][0]).toMatch(/summary\/Tokyo$/);
  });

  // "Victoria" is a list of places, not a place.
  it('does not take a picture from a disambiguation page', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(summary({ type: 'disambiguation' }))));
    expect(await fetchPlacePhoto('Victoria')).toBeNull();
  });

  it('remembers a photo, so the next open does not look it up again', async () => {
    const fetchMock = vi.fn(() => respond(summary()));
    vi.stubGlobal('fetch', fetchMock);
    await fetchPlacePhoto('Tokyo');
    await fetchPlacePhoto('Tokyo');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedPlacePhoto('tokyo')?.title).toBe('Tokyo');
  });

  it('remembers a miss too, but only for a day', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond({}, false)));
    const now = Date.now();
    await fetchPlacePhoto('Nowhere', now);
    expect(cachedPlacePhoto('Nowhere', now)).toBeNull();
    expect(cachedPlacePhoto('Nowhere', now + 2 * 24 * 60 * 60 * 1000)).toBeUndefined();
  });

  // Offline is not "this place has no photo".
  it('does not remember a lookup that failed to reach Wikipedia', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await fetchPlacePhoto('Tokyo')).toBeNull();
    expect(cachedPlacePhoto('Tokyo')).toBeUndefined();
  });
});
