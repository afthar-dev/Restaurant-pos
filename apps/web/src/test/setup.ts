import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetSessionStore } from '../auth/store';

// React Router builds a Request (Node's) with an AbortSignal (jsdom's) on every navigation, and
// Node rejects the foreign signal. Browsers do not have this split, so drop the signal in tests.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal: _signal, ...rest } = init ?? {};
    super(input, rest);
  }
} as typeof Request;

beforeEach(() => {
  // Default: the server never answers. Tests that need a response stub fetch themselves.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
  resetSessionStore();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
