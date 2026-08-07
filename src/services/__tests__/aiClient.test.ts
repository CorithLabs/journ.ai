import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getActiveProvider,
  setActiveProvider,
  keyStorageFor,
  streamCompletion,
  chatWithTools,
  MissingKeyError,
  PROVIDER_STORAGE,
  ANTHROPIC_MODEL,
  ANTHROPIC_MODEL_STORAGE,
  getAnthropicModel,
  setAnthropicModel,
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

  it('reconstructs a data line split across network chunks (no dropped text)', async () => {
    setActiveProvider('openai');
    await setApiKey('sk-test', OPENAI_KEY_STORAGE);
    // Emit RAW chunks that break a `data:` line mid-JSON — the exact condition
    // that used to drop both halves and corrupt the streamed output.
    const full =
      'data: {"choices":[{"delta":{"content":"Royal Ontario Museum"}}]}\n' +
      'data: [DONE]\n';
    const rawChunks = [full.slice(0, 40), full.slice(40, 75), full.slice(75)];
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const c of rawChunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body,
      json: async () => ({}),
    } as unknown as Response);
    const out = await streamCompletion([{ role: 'user', content: 'hi' }]);
    expect(out).toBe('Royal Ontario Museum');
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
    expect(body.model).toBe('claude-haiku-4-5');
  });

  it('sends the model chosen in Settings instead of the default', async () => {
    setActiveProvider('anthropic');
    setAnthropicModel('claude-sonnet-5');
    await setApiKey('sk-ant-test', ANTHROPIC_KEY_STORAGE);
    fetchMock.mockResolvedValueOnce(sseResponse(['data: {"type":"message_stop"}']));
    await streamCompletion([{ role: 'user', content: 'hi' }]);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.model).toBe('claude-sonnet-5');
  });

  it('falls back to the default model when the stored choice is cleared', async () => {
    setActiveProvider('anthropic');
    setAnthropicModel('claude-opus-5');
    setAnthropicModel('');
    expect(localStorage.getItem(ANTHROPIC_MODEL_STORAGE)).toBeNull();
    expect(getAnthropicModel()).toBe(ANTHROPIC_MODEL);
  });

  it('surfaces an Anthropic truncation (stop_reason max_tokens) as a clear error', async () => {
    setActiveProvider('anthropic');
    await setApiKey('sk-ant-test', ANTHROPIC_KEY_STORAGE);
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"days\\":[" }}',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}',
      ]),
    );
    await expect(
      streamCompletion([{ role: 'user', content: 'plan 21 days' }]),
    ).rejects.toThrow(/too long to generate/);
  });

  it('never sends `temperature` to Anthropic (Sonnet 5 / Opus 5 reject it)', async () => {
    setActiveProvider('anthropic');
    await setApiKey('sk-ant-test', ANTHROPIC_KEY_STORAGE);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    } as unknown as Response);
    await chatWithTools([{ role: 'user', content: 'hi' }], [
      {
        type: 'function',
        function: { name: 'noop', description: 'does nothing', parameters: {} },
      },
    ]);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).not.toHaveProperty('temperature');
    expect(body.model).toBe('claude-haiku-4-5');
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
