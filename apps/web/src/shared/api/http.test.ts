import { describe, expect, it } from 'vitest';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { apiFetch, ApiError } from './http';
import { useSession } from '@/shared/session/store';

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

  it('does not refresh or retry when a 401 is about a wrong PIN, not the session', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', []));
    const mock = mockApi({
      'POST /api/auth/override': () =>
        json({ code: 'INVALID_CREDENTIALS', message: 'Wrong PIN.' }, 401),
      'POST /api/auth/refresh': () => json(sessionBody('CASHIER', [])),
    });

    await expect(
      apiFetch('/api/auth/override', { method: 'POST', body: { pin: '1111' } }),
    ).rejects.toMatchObject({ status: 401, message: 'Wrong PIN.' });
    expect(callsTo(mock, 'POST', '/api/auth/override')).toHaveLength(1);
    expect(callsTo(mock, 'POST', '/api/auth/refresh')).toHaveLength(0);
    expect(useSession.getState().status).toBe('authenticated');
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

  it('keeps the session when refresh fails because the server is unreachable', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', []));
    mockApi({
      'GET /api/things': () => json({ code: 'UNAUTHENTICATED' }, 401),
      'POST /api/auth/refresh': () => json({ message: 'Bad gateway' }, 502),
    });
    const error = await apiFetch('/api/things').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'OFFLINE' });
    expect(useSession.getState().status).toBe('authenticated');
  });

  it('keeps the session when the refresh request itself fails', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', []));
    mockApi({
      'GET /api/things': () => json({ code: 'UNAUTHENTICATED' }, 401),
      'POST /api/auth/refresh': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await apiFetch('/api/things').catch(() => undefined);
    expect(useSession.getState().status).toBe('authenticated');
  });

  it('sends FormData as it is, without a JSON content type', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', []));
    const mock = mockApi({ 'PUT /api/menu/items/i1/image': () => json({}) });
    const form = new FormData();
    form.append('image', new Blob(['x'], { type: 'image/webp' }), 'photo.webp');
    await apiFetch('/api/menu/items/i1/image', { method: 'PUT', body: form });
    const init = mock.mock.calls[0]![1]!;
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).get('Content-Type')).toBeNull();
  });
});
