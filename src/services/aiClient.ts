/**
 * Provider-agnostic AI client.
 *
 * A single `streamCompletion` entry point routes to either OpenAI or Anthropic
 * based on the active provider preference stored in localStorage under
 * `aitp_ai_provider`. Call sites (GenerateItinerary, RouteOptimisation, the
 * agent chat, weather suggestions) import this and never talk to a provider
 * SDK/endpoint directly, so adding a provider only touches this file.
 *
 * No backend: Anthropic's Messages API supports browser-direct `fetch` (CORS
 * enabled with the `anthropic-dangerous-direct-browser-access` header), so the
 * PWA works without a proxy.
 */

import {
  getApiKey,
  OPENAI_KEY_STORAGE,
  ANTHROPIC_KEY_STORAGE,
} from './aiKey';

export type AiProvider = 'openai' | 'anthropic';

export const PROVIDER_STORAGE = 'aitp_ai_provider';

export const OPENAI_MODEL = 'gpt-4o-mini';
export const ANTHROPIC_MODEL = 'claude-haiku-3-5';

const MAX_TOKENS = 8000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  /** Override the token cap. Defaults to 8000. */
  maxTokens?: number;
  /** Sampling temperature. Defaults to 0.7. */
  temperature?: number;
  /** Called with the full accumulated text each time a delta arrives. */
  onToken?: (full: string) => void;
}

/** The active provider preference. Defaults to 'openai'. */
export function getActiveProvider(): AiProvider {
  const v = localStorage.getItem(PROVIDER_STORAGE);
  return v === 'anthropic' ? 'anthropic' : 'openai';
}

/** Persist the active provider preference. */
export function setActiveProvider(provider: AiProvider): void {
  localStorage.setItem(PROVIDER_STORAGE, provider);
}

/** The localStorage key holding the encrypted key for a provider. */
export function keyStorageFor(provider: AiProvider): string {
  return provider === 'anthropic' ? ANTHROPIC_KEY_STORAGE : OPENAI_KEY_STORAGE;
}

/** Thrown when no key is stored for the active provider. */
export class MissingKeyError extends Error {
  constructor() {
    super('Set up your API key in Settings.');
    this.name = 'MissingKeyError';
  }
}

/**
 * Stream a chat completion through the active provider. Resolves with the full
 * concatenated assistant text. Throws MissingKeyError when no key is stored,
 * or an Error with a user-facing message on provider/transport failure.
 */
export async function streamCompletion(
  messages: ChatMessage[],
  options: StreamOptions = {},
): Promise<string> {
  const provider = getActiveProvider();
  const apiKey = await getApiKey(keyStorageFor(provider));
  if (!apiKey) throw new MissingKeyError();

  const maxTokens = options.maxTokens ?? MAX_TOKENS;
  const temperature = options.temperature ?? 0.7;
  const onToken = options.onToken ?? (() => {});

  return provider === 'anthropic'
    ? streamAnthropic(apiKey, messages, maxTokens, temperature, onToken)
    : streamOpenAI(apiKey, messages, maxTokens, temperature, onToken);
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────

async function streamOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
  onToken: (full: string) => void,
): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) {
    const ed = (await resp.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(ed.error?.message ?? `API error ${resp.status}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');
  let fullText = '';
  const dec = new TextDecoder();
  // Buffer across reads: an SSE `data:` line can be split between two network
  // chunks. Splitting per-chunk (the old bug) dropped both halves of a split
  // line, corrupting the streamed JSON. Keep the trailing partial line for the
  // next read and only process complete lines.
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const p = JSON.parse(data) as {
          choices?: {
            delta?: { content?: string };
            finish_reason?: string | null;
          }[];
        };
        const choice = p.choices?.[0];
        fullText += choice?.delta?.content ?? '';
        onToken(fullText);
        if (choice?.finish_reason === 'length') {
          throw new Error(
            'The response was too long to generate in one go. Try a shorter request or retry.',
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('The response was too long')) {
          throw e;
        }
        /* ignore partial SSE frames */
      }
    }
  }
  return fullText;
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

/**
 * Anthropic's Messages API takes the system prompt as a top-level `system`
 * field, not a message with role 'system'. Split it out here.
 */
function splitSystem(messages: ChatMessage[]): {
  system: string | undefined;
  rest: { role: 'user' | 'assistant'; content: string }[];
} {
  const systemParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content);
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return {
    system: systemParts.length ? systemParts.join('\n\n') : undefined,
    rest,
  };
}

async function streamAnthropic(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
  _temperature: number,
  onToken: (full: string) => void,
): Promise<string> {
  const { system, rest } = splitSystem(messages);
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for browser-direct calls (no proxy backend).
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      stream: true,
      ...(system ? { system } : {}),
      messages: rest,
    }),
  });
  if (!resp.ok) {
    const ed = (await resp.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (resp.status === 503) {
      throw new Error('AI provider unavailable — try again shortly.');
    }
    throw new Error(ed.error?.message ?? `API error ${resp.status}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');
  let fullText = '';
  const dec = new TextDecoder();
  // Buffer across reads — an SSE `data:` line can split between two network
  // chunks; per-chunk splitting dropped both halves and corrupted the stream.
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
          error?: { message?: string };
        };
        // SSE error event — surface the payload to the caller.
        if (evt.type === 'error') {
          throw new Error(
            evt.error?.message ?? 'AI provider returned an error.',
          );
        }
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          fullText += evt.delta.text;
          onToken(fullText);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
          // Re-throw genuine provider errors; swallow partial-frame parse noise.
          if (!/JSON/.test(e.message)) throw e;
        }
        /* ignore partial SSE frames */
      }
    }
  }
  return fullText;
}

// ─── Tool-calling (agent) ─────────────────────────────────────────────────────

/** OpenAI-style tool schema (the shape `AGENT_TOOLS` provides). */
export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

/** A tool the model asked to run. `malformed` = arguments weren't valid JSON. */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  malformed?: boolean;
}

export interface ChatWithToolsResult {
  text: string;
  toolCalls: ToolCall[];
}

/**
 * Non-streaming chat that lets the model call the given tools, routed to the
 * active provider (OpenAI function-calling or Anthropic tool-use). Returns the
 * assistant text plus any tool calls. Throws MissingKeyError when no key is
 * stored, or an Error with a user-facing message on provider/transport failure.
 * The agent (useAgentChat) is the only caller; routing lives here so the agent
 * never talks to a provider endpoint directly.
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: readonly ToolSchema[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<ChatWithToolsResult> {
  const provider = getActiveProvider();
  const apiKey = await getApiKey(keyStorageFor(provider));
  if (!apiKey) throw new MissingKeyError();
  const maxTokens = options.maxTokens ?? MAX_TOKENS;
  const temperature = options.temperature ?? 0.7;
  return provider === 'anthropic'
    ? chatWithToolsAnthropic(apiKey, messages, tools, maxTokens, temperature)
    : chatWithToolsOpenAI(apiKey, messages, tools, maxTokens, temperature);
}

async function chatWithToolsOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  tools: readonly ToolSchema[],
  maxTokens: number,
  temperature: number,
): Promise<ChatWithToolsResult> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) {
    const ed = (await resp.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(ed.error?.message ?? `API error ${resp.status}`);
  }
  const data = (await resp.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { function?: { name?: string; arguments?: string } }[];
      };
    }[];
  };
  const msg = data.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => {
    const name = tc.function?.name ?? '';
    try {
      return {
        name,
        args: JSON.parse(tc.function?.arguments ?? '{}') as Record<string, unknown>,
      };
    } catch {
      return { name, args: {}, malformed: true };
    }
  });
  return { text: msg?.content ?? '', toolCalls };
}

async function chatWithToolsAnthropic(
  apiKey: string,
  messages: ChatMessage[],
  tools: readonly ToolSchema[],
  maxTokens: number,
  temperature: number,
): Promise<ChatWithToolsResult> {
  const { system, rest } = splitSystem(messages);
  // OpenAI {type:'function', function:{name,description,parameters}} →
  // Anthropic {name, description, input_schema}.
  const anthropicTools = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: rest,
      tools: anthropicTools,
    }),
  });
  if (!resp.ok) {
    const ed = (await resp.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (resp.status === 503) {
      throw new Error('AI provider unavailable — try again shortly.');
    }
    throw new Error(ed.error?.message ?? `API error ${resp.status}`);
  }
  const data = (await resp.json()) as {
    content?: (
      | { type: 'text'; text: string }
      | { type: 'tool_use'; name: string; input: Record<string, unknown> }
    )[];
  };
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const block of data.content ?? []) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') {
      toolCalls.push({ name: block.name, args: block.input ?? {} });
    }
  }
  return { text, toolCalls };
}
