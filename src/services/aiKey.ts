/**
 * AES-GCM encrypted BYOK key storage.
 *
 * Storage format: localStorage['aitp_api_key'] = JSON { ciphertext: "<base64>", iv: "<base64>" }
 * Salt: localStorage['aitp_device_salt'] = base64 string
 *
 * The raw key is NEVER written to localStorage in plaintext, and is held in
 * memory only for the duration of an AI call.
 */

const KEY_STORAGE = 'aitp_api_key';
const SALT_STORAGE = 'aitp_device_salt';

function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

/**
 * Decode base64 to a fresh ArrayBuffer-backed Uint8Array. Returning the
 * concrete ArrayBuffer keeps the Web Crypto `BufferSource` overloads happy
 * under strict lib typings (Uint8Array<ArrayBufferLike> is not assignable to
 * ArrayBufferView<ArrayBuffer>).
 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return view;
}

function freshBytes(len: number): Uint8Array {
  return new Uint8Array(new ArrayBuffer(len));
}

/** Return the per-device salt, generating and persisting one on first use. */
function getOrCreateDeviceSalt(): Uint8Array {
  const existing = localStorage.getItem(SALT_STORAGE);
  if (existing) return base64ToBytes(existing);
  const salt = freshBytes(16);
  crypto.getRandomValues(salt);
  localStorage.setItem(SALT_STORAGE, bytesToBase64(salt));
  return salt;
}

async function deriveKey(usage: KeyUsage[]): Promise<CryptoKey> {
  const salt = getOrCreateDeviceSalt();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    salt,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: freshBytes(16),
      info: new TextEncoder().encode('journ-ai-key'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

/**
 * Encrypt and store the API key.
 *
 * The raw key is trimmed before encoding — users copy-pasting from the OpenAI
 * dashboard frequently include a trailing newline or leading space, which
 * would otherwise be encrypted, stored, and sent verbatim, causing a 401.
 * An empty (or whitespace-only) key is rejected so we never store a blank key.
 */
export async function setApiKey(rawKey: string): Promise<void> {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    throw new Error('API key cannot be empty.');
  }
  const iv = freshBytes(12);
  crypto.getRandomValues(iv);
  const derivedKey = await deriveKey(['encrypt']);
  const plaintext = new TextEncoder().encode(trimmed);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    plaintext,
  );
  localStorage.setItem(
    KEY_STORAGE,
    JSON.stringify({
      ciphertext: bytesToBase64(ciphertext),
      iv: bytesToBase64(iv),
    }),
  );
}

/** Remove the stored key. AI features revert to degraded mode. */
export function clearApiKey(): void {
  localStorage.removeItem(KEY_STORAGE);
}

/**
 * Shared utility: decrypt and return the stored API key from localStorage.
 * Returns null if no key is stored, decryption fails, or crypto is unavailable.
 */
export async function getApiKey(): Promise<string | null> {
  try {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { ciphertext: string; iv: string };
    const deviceSalt = localStorage.getItem(SALT_STORAGE);
    if (!deviceSalt) return null;
    const derivedKey = await deriveKey(['decrypt']);
    const ivBytes = base64ToBytes(parsed.iv);
    const cipherBytes = base64ToBytes(parsed.ciphertext);
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
