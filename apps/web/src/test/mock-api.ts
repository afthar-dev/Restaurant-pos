import { vi } from 'vitest';

export type Handler = (request: {
  body: unknown;
  headers: Headers;
}) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Stubs fetch with handlers keyed by "METHOD /path". Unmatched requests never resolve,
 * like a server that is not answering. Returns the mock so tests can inspect calls.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();
    const handler = handlers[`${method} ${path}`];
    if (!handler) return new Promise<Response>(() => undefined);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    return handler({ body, headers: new Headers(init?.headers) });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

export function callsTo(mock: ReturnType<typeof mockApi>, method: string, path: string) {
  return mock.mock.calls.filter(([input, init]) => {
    const url = typeof input === 'string' ? input : input.toString();
    return url.startsWith(path) && (init?.method ?? 'GET').toUpperCase() === method;
  });
}

export const sessionBody = (
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER',
  permissions: string[],
  name = 'Test User',
) => ({
  accessToken: `token-${role.toLowerCase()}`,
  user: { id: '00000000-0000-4000-8000-000000000001', name, role },
  permissions,
});
