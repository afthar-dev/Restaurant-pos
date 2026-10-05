import { describe, expect, it } from 'vitest';
import { callsTo, json, mockApi, sessionBody } from '../test/mock-api';
import { apiFetch, ApiError } from './api';
import { useSession } from './store';

describe('apiFetch', () => {
  it('sends the access token and parses JSON', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', []));
    const mock = mockApi({ 'GET /api/things': () => json({ ok: true }) });

    await expect(apiFetch('/api/things')).resolves.toEqual({ ok: true });
    const headers = new Headers(mock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-cashier');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', []));
    const mock = mockApi({
      'GET /api/things': ({ headers }) =>
        headers.get('Authorization') === 'Bearer token-manager'
          ? json({ ok: true })
          : json({ code: 'UNAUTHENTICATED' }, 401),
      'POST /api/auth/refresh': () => json(sessionBody('MANAGER', ['bill.void'])),
    });

    await expect(apiFetch('/api/things')).resolves.toEqual({ ok: true });
    expect(callsTo(mock, 'POST', '/api/auth/refresh')).toHaveLength(1);
    expect(useSession.getState().user?.role).toBe('MANAGER');
  });

  it('shares one refresh between concurrent 401s', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', []));
    const mock = mockApi({
      'GET /api/things': ({ headers }) =>
        headers.get('Authorization') === 'Bearer token-manager'
          ? json({ ok: true })
          : json({ code: 'UNAUTHENTICATED' }, 401),
      'POST /api/auth/refresh': async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return json(sessionBody('MANAGER', []));
      },
    });

    const results = await Promise.all([
      apiFetch('/api/things'),
      apiFetch('/api/things'),
      apiFetch('/api/things'),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(callsTo(mock, 'POST', '/api/auth/refresh')).toHaveLength(1);
  });

  it('clears the session and throws when refresh fails', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', []));
    mockApi({
      'GET /api/things': () => json({ code: 'UNAUTHENTICATED' }, 401),
      'POST /api/auth/refresh': () => json({ code: 'SESSION_EXPIRED' }, 401),
    });

    const error = await apiFetch('/api/things').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(useSession.getState().status).toBe('anonymous');
  });

  it('exposes the error code and extra fields from the body', async () => {
    mockApi({
      'POST /api/auth/login': () =>
        json({ code: 'LOCKED', message: 'Locked', retryAfterSeconds: 600 }, 423),
    });
    const error = await apiFetch('/api/auth/login', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ status: 423, code: 'LOCKED', body: { retryAfterSeconds: 600 } });
  });

  it('returns undefined for 204', async () => {
    mockApi({ 'POST /api/auth/logout': () => new Response(null, { status: 204 }) });
    await expect(apiFetch('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
