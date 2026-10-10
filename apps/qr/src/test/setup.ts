import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { useCart } from '@/features/cart/store';
import { useSession } from '@/features/session/store';

beforeEach(() => {
  // Default: the server never answers. Tests that need a response stub fetch themselves.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
  localStorage.clear();
  useSession.setState({ code: null, session: null, ended: false });
  useCart.getState().clear();
});

// jsdom has no layout: scrolling to a menu section is a no-op in tests.
Element.prototype.scrollIntoView ??= () => undefined;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
