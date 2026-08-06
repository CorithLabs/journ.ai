// Provider-agnostic AI client — streamCompletion + chatWithTools
import { getApiKey, OPENAI_KEY_STORAGE, ANTHROPIC_KEY_STORAGE } from './aiKey';

export type AiProvider = 'openai' | 'anthropic';
export const PROVIDER_STORAGE = 'aitp_ai_provider';
export const OPENAI_MODEL = 'gpt-4o-mini';
export const ANTHROPIC_MODEL = 'claude-haiku-3-5';
const MAX_TOKENS = 8000;

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface StreamOptions { maxTokens?: number; temperature?: number; onToken?: (full: string) => void; }

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    // Use readonly string[] so as-const tool arrays are compatible
    parameters: { type: 'object'; properties: Record<string, unknown>; required?: readonly string[]; };
  };
}
export interface ParsedToolCall { name: string; args: Record<string, unknown>; malformed?: boolean; }
export interface ToolOptions { temperature?: number; }
export interface ChatWithToolsResult { text: string; toolCalls: ParsedToolCall[]; }

export function getActiveProvider(): AiProvider {
  return localStorage.getItem(PROVIDER_STORAGE) === 'anthropic' ? 'anthropic' : 'openai';
}
export function setActiveProvider(p: AiProvider): void { localStorage.setItem(PROVIDER_STORAGE, p); }
export function keyStorageFor(p: AiProvider): string { return p === 'anthropic' ? ANTHROPIC_KEY_STORAGE : OPENAI_KEY_STORAGE; }

export class MissingKeyError extends Error {
  constructor() { super('Set up your API key in Settings.'); this.name = 'MissingKeyError'; }
}

export async function streamCompletion(messages: ChatMessage[], options: StreamOptions = {}): Promise<string> {
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

export async function chatWithTools(
  messages: ChatMessage[],
  tools: readonly ToolDefinition[],
  options: ToolOptions = {},
): Promise<ChatWithToolsResult> {
  const provider = getActiveProvider();
  const apiKey = await getApiKey(keyStorageFor(provider));
  if (!apiKey) throw new MissingKeyError();
  const temperature = options.temperature ?? 0.7;
  return provider === 'anthropic'
    ? chatWithToolsAnthropic(apiKey, messages, tools, temperature)
    : chatWithToolsOpenAI(apiKey, messages, tools, temperature);
}

// --- OpenAI streaming ---
async function streamOpenAI(apiKey: string, messages: ChatMessage[], maxTokens: number, temperature: number, onToken: (full: string) => void): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, stream: true, temperature, max_tokens: maxTokens }),
  });
  if (!resp.ok) { const ed = (await resp.json().catch(() => ({}))) as { error?: { message?: string } }; throw new Error(ed.error?.message ?? `API error ${resp.status}`); }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');
  let fullText = '';
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '))) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const p = JSON.parse(data) as { choices?: { delta?: { content?: string }; finish_reason?: string | null }[] };
        const choice = p.choices?.[0];
        fullText += choice?.delta?.content ?? '';
        onToken(fullText);
        if (choice?.finish_reason === 'length') throw new Error('The response was too long to generate in one go. Try a shorter request or retry.');
      } catch (e) { if (e instanceof Error && e.message.startsWith('The response was too long')) throw e; }
    }
  }
  return fullText;
}

// --- OpenAI chatWithTools ---
async function chatWithToolsOpenAI(apiKey: string, messages: ChatMessage[], tools: readonly ToolDefinition[], temperature: number): Promise<ChatWithToolsResult> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, tools, temperature }),
  });
  if (!resp.ok) { const ed = (await resp.json().catch(() => ({}))) as { error?: { message?: string } }; throw new Error(ed.error?.message ?? `API error ${resp.status}`); }
  const body = (await resp.json()) as { choices?: { message?: { content?: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] };
  const msg = body.choices?.[0]?.message;
  const text = msg?.content ?? '';
  const toolCalls: ParsedToolCall[] = (msg?.tool_calls ?? []).map(tc => {
    try { return { name: tc.function.name, args: JSON.parse(tc.function.arguments) as Record<string, unknown> }; }
    catch { return { name: tc.function.name, args: {}, malformed: true }; }
  });
  return { text, toolCalls };
}

// --- Anthropic helpers ---
function splitSystem(messages: ChatMessage[]): { system: string | undefined; rest: { role: 'user' | 'assistant'; content: string }[] } {
  const sys = messages.filter(m => m.role === 'system').map(m => m.content);
  const rest = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { system: sys.length ? sys.join('\n\n') : undefined, rest };
}
function toAnthropicTool(tool: ToolDefinition) {
  return { name: tool.function.name, ...(tool.function.description ? { description: tool.function.description } : {}), input_schema: tool.function.parameters };
}

// --- Anthropic streaming ---
async function streamAnthropic(apiKey: string, messages: ChatMessage[], maxTokens: number, _temperature: number, onToken: (full: string) => void): Promise<string> {
  const { system, rest } = splitSystem(messages);
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, stream: true, ...(system ? { system } : {}), messages: rest }),
  });
  if (!resp.ok) {
    const ed = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
    if (resp.status === 503) throw new Error('AI provider unavailable — try again shortly.');
    throw new Error(ed.error?.message ?? `API error ${resp.status}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');
  let fullText = '';
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '))) {
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
        if (evt.type === 'error') throw new Error(evt.error?.message ?? 'AI provider returned an error.');
        if (evt.type === 'content_block_delta' && evt.delta?.text) { fullText += evt.delta.text; onToken(fullText); }
      } catch (e) { if (e instanceof Error && e.message !== 'Unexpected end of JSON input' && !/JSON/.test(e.message)) throw e; }
    }
  }
  return fullText;
}

// --- Anthropic chatWithTools ---
async function chatWithToolsAnthropic(apiKey: string, messages: ChatMessage[], tools: readonly ToolDefinition[], _temperature: number): Promise<ChatWithToolsResult> {
  const { system, rest } = splitSystem(messages);
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, ...(system ? { system } : {}), messages: rest, tools: tools.map(toAnthropicTool) }),
  });
  if (!resp.ok) {
    const ed = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
    if (resp.status === 503) throw new Error('AI provider unavailable — try again shortly.');
    throw new Error(ed.error?.message ?? `API error ${resp.status}`);
  }
  const body = (await resp.json()) as { content?: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[] };
  const content = body.content ?? [];
  const text = content.filter(b => b.type === 'text' && b.text).map(b => b.text!).join('');
  const toolCalls: ParsedToolCall[] = content.filter(b => b.type === 'tool_use').map(b => ({ name: b.name ?? '', args: b.input ?? {} }));
  return { text, toolCalls };
}
