import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setApiKey, getApiKey, clearApiKey } from '../aiKey';

// The global crypto mock (src/test/setup.ts) stubs subtle.encrypt/decrypt.
// We assert the trim behaviour by capturing the plaintext bytes that setApiKey
// hands to crypto.subtle.encrypt and decoding them back to a string.

function decodeEncryptedPlaintext(): string {
  const encryptMock = vi.mocked(crypto.subtle.encrypt);
  expect(encryptMock).toHaveBeenCalled();
  const lastCall = encryptMock.mock.calls[encryptMock.mock.calls.length - 1];
  const plaintextArg = lastCall[2] as Uint8Array | ArrayBuffer;
  const bytes =
    plaintextArg instanceof Uint8Array
      ? plaintextArg
      : new Uint8Array(plaintextArg);
  return new TextDecoder().decode(bytes);
}

describe('setApiKey — whitespace trimming', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("trims a trailing space: 'sk-abc ' -> 'sk-abc'", async () => {
    await setApiKey('sk-abc ');
    expect(decodeEncryptedPlaintext()).toBe('sk-abc');
  });

  it("trims leading space and trailing newline: '  sk-abc\\n' -> 'sk-abc'", async () => {
    await setApiKey('  sk-abc\n');
    expect(decodeEncryptedPlaintext()).toBe('sk-abc');
  });

  it('preserves internal spaces (only leading/trailing trimmed)', async () => {
    await setApiKey('  sk-abc def  ');
    expect(decodeEncryptedPlaintext()).toBe('sk-abc def');
  });

  it('rejects a whitespace-only key before encrypting', async () => {
    await expect(setApiKey('   \n ')).rejects.toThrow(/empty/i);
    expect(crypto.subtle.encrypt).not.toHaveBeenCalled();
  });

  it('rejects an empty key', async () => {
    await expect(setApiKey('')).rejects.toThrow(/empty/i);
  });

  it('persists an encrypted blob (never the raw key) to localStorage', async () => {
    await setApiKey('sk-abc ');
    const raw = localStorage.getItem('aitp_api_key');
    expect(raw).toBeTruthy();
    // Must be a { ciphertext, iv } JSON object, not the plaintext key.
    const parsed = JSON.parse(raw as string);
    expect(parsed).toHaveProperty('ciphertext');
    expect(parsed).toHaveProperty('iv');
    expect(raw).not.toContain('sk-abc');
  });
});

describe('clearApiKey', () => {
  it('removes the stored key', async () => {
    await setApiKey('sk-abc');
    expect(localStorage.getItem('aitp_api_key')).toBeTruthy();
    clearApiKey();
    expect(localStorage.getItem('aitp_api_key')).toBeNull();
    expect(await getApiKey()).toBeNull();
  });
});
