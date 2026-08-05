/**
 * BYOK API key storage — AES-GCM 256-bit encryption at rest.
 *
 * Storage format (per provider):
 *   localStorage['aitp_api_key']         = OpenAI    JSON { ciphertext, iv }
 *   localStorage['aitp_anthropic_key']   = Anthropic JSON { ciphertext, iv }
 *   localStorage['aitp_device_salt']     = base64 string (per-device random salt)
 *
 * The raw key is NEVER written to any persistent store. The plaintext key is
 * held in memory only for the duration of each AI call (the return value of
 * getApiKey()) and never serialised into Zustand or elsewhere.
 *
 * `API_KEY_STORAGE` is the legacy/default OpenAI slot. `OPENAI_KEY_STORAGE` is
 * an alias so provider-aware call sites can be explicit; `ANTHROPIC_KEY_STORAGE`
 * is the second BYOK provider slot.
 */

export const API_KEY_STORAGE = 'aitp_api_key';
export const OPENAI_KEY_STORAGE = API_KEY_STORAGE;
export const ANTHROPIC_KEY_STORAGE = 'aitp_anthropic_key';
export const DEVICE_SALT_STORAGE = 'aitp_device_salt';

const KEY_INFO = 'journ-ai-key';

/** True when the Web Crypto SubtleCrypto API is available (secure context). */
export function isCryptoAvailable(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt === 'function'
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Returns the per-device salt, generating and persisting a random one on first
 * use. The salt is not secret — it exists so the derived key differs per device.
 */
function getOrCreateDeviceSalt(): Uint8Array<ArrayBuffer> {
  let stored = localStorage.getItem(DEVICE_SALT_STORAGE);
  if (!stored) {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    stored = toBase64(salt);
    localStorage.setItem(DEVICE_SALT_STORAGE, stored);
  }
  return fromBase64(stored);
}

/**
 * Derive an AES-GCM key from the device salt via HKDF. The derivation is
 * intentionally identical for encrypt and decrypt so a key encrypted with
 * setApiKey() can be read back by getApiKey().
 */
async function deriveKey(
  saltBytes: Uint8Array<ArrayBuffer>,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    saltBytes,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(16),
      info: new TextEncoder().encode(KEY_INFO),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

/**
 * Encrypt and persist the raw API key under the given provider slot (defaults
 * to the OpenAI slot). Trims leading/trailing whitespace — pasted keys often
 * carry a trailing newline that would otherwise be sent verbatim and rejected.
 * Throws 'empty-key' when nothing remains after trimming, and 'crypto-unavailable'
 * / QuotaExceededError so callers can surface a specific error WITHOUT any
 * plaintext fallback.
 */
export async function setApiKey(
  rawKey: string,
  storageKey: string = OPENAI_KEY_STORAGE,
): Promise<void> {
  if (!isCryptoAvailable()) {
    throw new Error('crypto-unavailable');
  }
  const trimmed = rawKey.trim();
  if (!trimmed) {
    throw new Error('empty-key');
  }
  const saltBytes = getOrCreateDeviceSalt();
  const derivedKey = await deriveKey(saltBytes, ['encrypt']);
  const iv = new Uint8Array(12); // 96-bit IV, fresh per encryption
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    new TextEncoder().encode(trimmed),
  );
  const payload = JSON.stringify({
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  });
  // localStorage.setItem throws QuotaExceededError when storage is full —
  // let it propagate; we never write a plaintext fallback.
  localStorage.setItem(storageKey, payload);
}

/** Remove the stored key for a provider (reverts AI features to degraded mode). */
export function clearApiKey(storageKey: string = OPENAI_KEY_STORAGE): void {
  localStorage.removeItem(storageKey);
}

/**
 * Decrypt and return the stored API key for a provider slot from localStorage.
 * Returns null if no key is stored, the salt is missing, decryption fails
 * (tampered storage), or crypto is unavailable. On corruption the stale
 * ciphertext is cleared so the user is prompted to re-enter their key.
 */
export async function getApiKey(
  storageKey: string = OPENAI_KEY_STORAGE,
): Promise<string | null> {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    const deviceSalt = localStorage.getItem(DEVICE_SALT_STORAGE);
    if (!deviceSalt) {
      // Salt missing but ciphertext present → unrecoverable; clear and prompt.
      clearApiKey(storageKey);
      return null;
    }
    const parsed = JSON.parse(stored) as { ciphertext: string; iv: string };
    const saltBytes = fromBase64(deviceSalt);
    const derivedKey = await deriveKey(saltBytes, ['decrypt']);
    const ivBytes = fromBase64(parsed.iv);
    const cipherBytes = fromBase64(parsed.ciphertext);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      derivedKey,
      cipherBytes,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** True when a key is currently stored for the given provider slot. */
export function hasStoredKey(storageKey: string = OPENAI_KEY_STORAGE): boolean {
  return localStorage.getItem(storageKey) !== null;
}
