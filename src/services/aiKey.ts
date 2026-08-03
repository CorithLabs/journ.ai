/**
 * BYOK API key storage — AES-GCM 256-bit encryption at rest.
 *
 * Storage format:
 *   localStorage['aitp_api_key']     = JSON { ciphertext: "<base64>", iv: "<base64>" }
 *   localStorage['aitp_device_salt'] = base64 string (per-device random salt)
 *
 * The raw key is NEVER written to any persistent store. The plaintext key is
 * held in memory only for the duration of each AI call (the return value of
 * getApiKey()) and never serialised into Zustand or elsewhere.
 */

export const API_KEY_STORAGE = 'aitp_api_key';
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

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Returns the per-device salt, generating and persisting a random one on first
 * use. The salt is not secret — it exists so the derived key differs per device.
 */
function getOrCreateDeviceSalt(): Uint8Array {
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
  saltBytes: Uint8Array,
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
 * Encrypt and persist the raw API key. Throws on failure (e.g. quota full)
 * so the caller can surface a specific error WITHOUT any plaintext fallback.
 */
export async function setApiKey(rawKey: string): Promise<void> {
  if (!isCryptoAvailable()) {
    throw new Error('crypto-unavailable');
  }
  const saltBytes = getOrCreateDeviceSalt();
  const derivedKey = await deriveKey(saltBytes, ['encrypt']);
  const iv = new Uint8Array(12); // 96-bit IV, fresh per encryption
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    new TextEncoder().encode(rawKey),
  );
  const payload = JSON.stringify({
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  });
  // localStorage.setItem throws QuotaExceededError when storage is full —
  // let it propagate; we never write a plaintext fallback.
  localStorage.setItem(API_KEY_STORAGE, payload);
}

/** Remove the stored key entirely (reverts AI features to degraded mode). */
export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

/**
 * Decrypt and return the stored API key from localStorage.
 * Returns null if no key is stored, the salt is missing, decryption fails
 * (tampered storage), or crypto is unavailable. On corruption the stale
 * ciphertext is cleared so the user is prompted to re-enter their key.
 */
export async function getApiKey(): Promise<string | null> {
  try {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (!stored) return null;
    const deviceSalt = localStorage.getItem(DEVICE_SALT_STORAGE);
    if (!deviceSalt) {
      // Salt missing but ciphertext present → unrecoverable; clear and prompt.
      clearApiKey();
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

/** True when a (readable) key is currently stored. */
export function hasStoredKey(): boolean {
  return localStorage.getItem(API_KEY_STORAGE) !== null;
}
