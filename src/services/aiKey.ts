/**
 * src/services/aiKey.ts
 *
 * AES-GCM API key encryption/decryption helpers.
 * The raw API key is NEVER persisted — only the encrypted ciphertext is stored.
 *
 * localStorage keys:
 *   aitp_api_key     → JSON { ciphertext: base64, iv: base64 }
 *   aitp_device_salt → base64-encoded random 32-byte device salt
 */

const STORAGE_KEY = 'aitp_api_key';
const SALT_KEY = 'aitp_device_salt';
const KEY_INFO = new TextEncoder().encode('journ-ai-key');

async function getDerivedKey(usage: KeyUsage[]): Promise<CryptoKey> {
  const saltB64 = localStorage.getItem(SALT_KEY);
  if (!saltB64) throw new Error('Device salt missing');
  const saltBytes = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
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
      info: KEY_INFO,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

/**
 * Encrypts the raw API key and persists it to localStorage.
 * Generates a random device salt if one doesn't already exist.
 */
export async function saveApiKey(rawKey: string): Promise<void> {
  // Ensure a device salt exists
  if (!localStorage.getItem(SALT_KEY)) {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)));
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derivedKey = await getDerivedKey(['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    new TextEncoder().encode(rawKey),
  );

  const stored = {
    ciphertext: btoa(
      String.fromCharCode(...new Uint8Array(ciphertext)),
    ),
    iv: btoa(String.fromCharCode(...iv)),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/**
 * Decrypts and returns the stored API key, or null if none is set or
 * decryption fails (treated as missing key — AI features degrade gracefully).
 */
export async function getApiKey(): Promise<string | null> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { ciphertext: string; iv: string };
    const derivedKey = await getDerivedKey(['decrypt']);
    const ivBytes = Uint8Array.from(atob(parsed.iv), (c) => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(
      atob(parsed.ciphertext),
      (c) => c.charCodeAt(0),
    );
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

/**
 * Removes the stored API key and device salt from localStorage.
 */
export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}
