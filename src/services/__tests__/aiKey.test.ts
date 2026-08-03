import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  setApiKey,
  getApiKey,
  clearApiKey,
  hasStoredKey,
  isCryptoAvailable,
  API_KEY_STORAGE,
  DEVICE_SALT_STORAGE,
} from '../aiKey';

// The global test setup mocks crypto.subtle with canned stubs. For a REAL
// encrypt → store → decrypt round-trip we swap in Node's real WebCrypto.
const savedCrypto = globalThis.crypto;

// Minimal in-memory localStorage for the node test environment.
class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(k: string) {
    return k in this.store ? this.store[k] : null;
  }
  setItem(k: string, v: string) {
    this.store[k] = v;
  }
  removeItem(k: string) {
    delete this.store[k];
  }
  clear() {
    this.store = {};
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: savedCrypto,
    writable: true,
    configurable: true,
  });
});

describe('aiKey — AES-GCM at rest', () => {
  it('reports crypto as available with real WebCrypto', () => {
    expect(isCryptoAvailable()).toBe(true);
  });

  it('encrypt → store → decrypt round-trips the original key', async () => {
    const raw = 'sk-proj-abcdef1234567890';
    await setApiKey(raw);
    const back = await getApiKey();
    expect(back).toBe(raw);
  });

  it('stores ciphertext + iv, never the raw key string', async () => {
    const raw = 'sk-secret-plaintext-key';
    await setApiKey(raw);
    const stored = localStorage.getItem(API_KEY_STORAGE)!;
    expect(stored).not.toContain(raw);
    const parsed = JSON.parse(stored) as { ciphertext: string; iv: string };
    expect(parsed.ciphertext).toBeTruthy();
    expect(parsed.iv).toBeTruthy();
    // 96-bit IV → 12 bytes → base64 of length 16
    expect(atob(parsed.iv).length).toBe(12);
  });

  it('generates and persists a device salt on first save', async () => {
    expect(localStorage.getItem(DEVICE_SALT_STORAGE)).toBeNull();
    await setApiKey('sk-x');
    expect(localStorage.getItem(DEVICE_SALT_STORAGE)).toBeTruthy();
  });

  it('uses a fresh IV per encryption (two saves differ)', async () => {
    await setApiKey('sk-same');
    const first = localStorage.getItem(API_KEY_STORAGE)!;
    await setApiKey('sk-same');
    const second = localStorage.getItem(API_KEY_STORAGE)!;
    expect(JSON.parse(first).iv).not.toBe(JSON.parse(second).iv);
  });

  it('returns null when no key is stored', async () => {
    expect(await getApiKey()).toBeNull();
  });

  it('treats a missing device salt as corrupted and clears the key', async () => {
    await setApiKey('sk-orphan');
    localStorage.removeItem(DEVICE_SALT_STORAGE);
    expect(await getApiKey()).toBeNull();
    // Stale ciphertext should be cleared so the user is prompted to re-enter.
    expect(localStorage.getItem(API_KEY_STORAGE)).toBeNull();
  });

  it('returns null on tampered ciphertext', async () => {
    await setApiKey('sk-tamper');
    const parsed = JSON.parse(localStorage.getItem(API_KEY_STORAGE)!);
    parsed.ciphertext = btoa('garbage-ciphertext-value');
    localStorage.setItem(API_KEY_STORAGE, JSON.stringify(parsed));
    expect(await getApiKey()).toBeNull();
  });

  it('clearApiKey removes the stored key', async () => {
    await setApiKey('sk-clear');
    expect(hasStoredKey()).toBe(true);
    clearApiKey();
    expect(hasStoredKey()).toBe(false);
    expect(await getApiKey()).toBeNull();
  });
});
