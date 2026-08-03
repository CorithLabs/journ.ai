import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock IndexedDB for tests
const mockDb = {
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
};

vi.mock('../db', () => ({
  db: mockDb,
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((fn: () => unknown) => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ planId: 'test-plan-id' }),
    useLocation: () => ({ pathname: '/plan/test-plan-id/itinerary' }),
  };
});

// Mock crypto.subtle for tests
Object.defineProperty(global, 'crypto', {
  value: {
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
    },
  },
  writable: true,
});
