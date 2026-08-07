import { hasStoredKey } from './aiKey';
import { keyStorageFor } from './aiClient';

/**
 * Whether ANY AI provider has a key stored.
 *
 * Checked per provider rather than for the active one: a user who saved an
 * OpenAI key and later switched the dropdown to Anthropic still has a working
 * setup for the provider they configured, and shouldn't be told they have none.
 */
export function hasAnyAiKey(): boolean {
  return hasStoredKey(keyStorageFor('openai')) || hasStoredKey(keyStorageFor('anthropic'));
}

export const NO_AI_KEY_MESSAGE =
  'Add an OpenAI or Anthropic API key in Settings to build a trip. Journ.ai uses your own key and never sends it to our servers.';
