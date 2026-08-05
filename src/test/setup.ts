import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock the entire db module to avoid Dexie/IndexedDB in tests
vi.mock('../db', () => ({
  db: {
    plans: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      // .filter(predicate).sortBy('createdAt') is the canonical soft-delete
      // query pattern — Plan.deleted is a boolean, so index-based .where/.equals
      // is unsafe. The mock returns a chainable object exposing sortBy AND count
      // (the demo seed calls .filter(...).count() on first launch).
      filter: vi.fn().mockReturnValue({
        sortBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        toArray: vi.fn().mockResolvedValue([]),
      }),
      sortBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      get: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue('mock-id'),
      update: vi.fn().mockResolvedValue(1),
      delete: vi.fn().mockResolvedValue(undefined),
      bulkAdd: vi.fn().mockResolvedValue([]),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    todos: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnValue({
        sortBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        toArray: vi.fn().mockResolvedValue([]),
      }),
      sortBy: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue('mock-id'),
      update: vi.fn().mockResolvedValue(1),
      delete: vi.fn().mockResolvedValue(undefined),
      bulkAdd: vi.fn().mockResolvedValue([]),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    clipboard: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnValue({
        sortBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        toArray: vi.fn().mockResolvedValue([]),
      }),
      sortBy: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue('mock-id'),
      update: vi.fn().mockResolvedValue(1),
      delete: vi.fn().mockResolvedValue(undefined),
      bulkAdd: vi.fn().mockResolvedValue([]),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ planId: 'test-plan-id' }),
    useLocation: () => ({
      pathname: '/plan/test-plan-id/itinerary',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    }),
  };
});

/**
 * Mock crypto.subtle for tests.
 *
 * encrypt/decrypt are a faithful passthrough round-trip: encrypt returns a copy
 * of the plaintext bytes as "ciphertext", and decrypt returns whatever
 * ciphertext bytes it is handed. This means getApiKey() decrypts back to the
 * exact key that setApiKey() encrypted — so tests can store different keys per
 * provider (e.g. an OpenAI key vs an Anthropic key) and read each back
 * correctly, instead of every decrypt yielding a single hard-coded string.
 */
function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  return new Uint8Array(data.slice(0));
}

const mockCrypto = {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  },
  subtle: {
    importKey: vi.fn().mockResolvedValue({}),
    deriveKey: vi.fn().mockResolvedValue({}),
    encrypt: vi.fn().mockImplementation(async (_algo, _key, data: ArrayBuffer | ArrayBufferView) => {
      // Echo the plaintext through as ciphertext (buffer, matching Web Crypto).
      return toBytes(data).buffer;
    }),
    decrypt: vi.fn().mockImplementation(async (_algo, _key, data: ArrayBuffer | ArrayBufferView) => {
      // Return the ciphertext bytes verbatim — completes the round-trip.
      return toBytes(data).buffer;
    }),
    exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
  },
};

Object.defineProperty(globalThis, 'crypto', {
  value: mockCrypto,
  writable: true,
  configurable: true,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollIntoView (not implemented in jsdom)
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock Element.scrollIntoView
Element.prototype.scrollIntoView = vi.fn();
