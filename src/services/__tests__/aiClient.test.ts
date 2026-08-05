import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getActiveProvider,
  setActiveProvider,
  keyStorageFor,
  streamCompletion,
  MissingKeyError,
  PROVIDER_STORAGE,
} from '../aiClient';
import { setApiKey, OPENAI_KEY_STORAGE, ANTHROPIC_KEY_STORAGE } from '../aiKey';

/**
 * Build a Response whose body streams the given SSE lines, so streamCompletion
 * can be driven without a real network. Each line is emitted as one chunk.
 */
function sseResponse(lines: string[], ok = true, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const l of lines) controller.enqueue(encoder.encode(l + '\n'));
      controller.close();
    },
  });
  return {
    ok,
    status,
    body: stream,
    json: async () => ({}),
  } as unknown as Response;
}

describe('aiClient provider preference', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('defaults to openai when nothing is stored', () => {
    expect(getActiveProvider()).toBe('openai');
  });

  it('round-trips the provider preference through localStorage', () => {
    setActiveProvider('anthropic');
    expect(localStorage.getItem(PROVIDER_STORAGE)).toBe('anthropic');
    expect(getActiveProvider()).toBe('anthropic');
    setActiveProvider('openai');
    expect(getActiveProvider()).toBe('openai');
  });

  it('maps each provider to its own key storage slot', () => {
    expect(keyStorageFor('openai')).toBe(OPENAI_KEY_STORAGE);
    expect(keyStorageFor('anthropic')).toBe(ANTHROPIC_KEY_STORAGE);
  });
});

describe('streamCompletion routing', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws MissingKeyError when the active provider has no key', async () => {
    setActiveProvider('openai');
    await expect(
      streamCompletion([{ role: 'user', content: 'hi' }]),
    ).rejects.toBeInstanceOf(MissingKeyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the OpenAI endpoint and accumulates delta content', async () => {
    setActiveProvider('openai');
    await setApiKey('sk-test', OPENAI_KEY_STORAGE);
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello "}}]}',
        'data: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}]}',
        'data: [DONE]',
      ]),
    );
    const tokens: string[] = [];
    const out = await streamCompletion([{ role: 'user', content: 'hi' }], {
      onToken: (f) => tokens.push(f),
    });
    expect(out).toBe('Hello world');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(tokens[tokens.length - 1]).toBe('Hello world');
  });

  it('calls the Anthropic endpoint with the right headers and parses text deltas', async () => {
    setActiveProvider('anthropic');
    await setApiKey('sk-ant-test', ANTHROPIC_KEY_STORAGE);
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bonjour "}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"monde"}}',
        'data: {"type":"message_stop"}',
      ]),
    );
    const out = await streamCompletion([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ]);
    expect(out).toBe('Bonjour monde');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');

    // system message is lifted to a top-level `system` field, not in messages
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toBe('be terse');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.max_tokens).toBe(8000);
    expect(body.model).toBe('claude-haiku-3-5');
  });

  it('surfaces a 503 from Anthropic as a clear "unavailable" error', async () => {
    setActiveProvider('anthropic');
    await setApiKey('sk-ant-test', ANTHROPIC_KEY_STORAGE);
    fetchMock.mockResolvedValueOnce(sseResponse([], false, 503));
    await expect(
      streamCompletion([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/unavailable/i);
  });
});
