import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock the entire db module to avoid Dexie/IndexedDB in tests
vi.mock('../db', () => ({
  db: {
    plans: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      sortBy: vi.fn().mockResolvedValue([]),
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
      sortBy: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue('mock-id'),
      update: vi.fn().mockResolvedValue(1),
      delete: vi.fn().mockResolvedValue(undefined),
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

// Mock crypto.subtle for tests
const mockCrypto = {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  },
  subtle: {
    importKey: vi.fn().mockResolvedValue({}),
    deriveKey: vi.fn().mockResolvedValue({}),
    encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    decrypt: vi.fn().mockImplementation(async () => {
      return new TextEncoder().encode('sk-test-key-12345');
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
