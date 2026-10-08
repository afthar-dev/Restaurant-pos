import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetRefreshState } from '@/shared/api/http';
import { resetSessionStore } from '@/shared/session/store';
import { useStationFilter } from '@/features/kitchen/store';
import { useNotifications } from '@/features/notifications/store';

// findBy… waits up to 5 s: full screens with the app shell render slower on a busy machine.
configure({ asyncUtilTimeout: 5000 });

// jsdom lacks a few browser APIs that Radix UI (dialogs, menus, tooltips) calls.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;
// axe probes a canvas to spot icon fonts; jsdom has none, so answer "no canvas" quietly.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

// No real sockets in tests. Tests that check realtime behaviour mock this module themselves.
vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = { on: () => socket, disconnect: () => undefined };
    return socket;
  },
}));

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
  localStorage.clear();
  // Default: the server never answers. Tests that need a response stub fetch themselves.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
  resetSessionStore();
  resetRefreshState();
  useNotifications.getState().reset();
  useStationFilter.setState({ station: '' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
