import { vi } from 'vitest';

type Handler = (request: { body: unknown; headers: Headers }) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Stubs fetch with handlers keyed by "METHOD /path"; unmatched requests never resolve. */
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
