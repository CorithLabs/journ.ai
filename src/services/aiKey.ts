/**
 * Shared utility: decrypt and return the stored API key from localStorage.
 * Returns null if no key is stored, decryption fails, or crypto is unavailable.
 *
 * Storage format: localStorage['aitp_api_key'] = JSON { ciphertext: "<base64>", iv: "<base64>" }
 * Salt: localStorage['aitp_device_salt'] = base64 string
 */
export async function getApiKey(): Promise<string | null> {
  try {
    const stored = localStorage.getItem('aitp_api_key');
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { ciphertext: string; iv: string };
    const deviceSalt = localStorage.getItem('aitp_device_salt');
    if (!deviceSalt) return null;
    const saltBytes = Uint8Array.from(atob(deviceSalt), (c) => c.charCodeAt(0));
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      saltBytes,
      { name: 'HKDF' },
      false,
      ['deriveKey'],
    );
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(16),
        info: new TextEncoder().encode('journ-ai-key'),
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const ivBytes = Uint8Array.from(atob(parsed.iv), (c) => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(parsed.ciphertext), (c) => c.charCodeAt(0));
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
