import { useSession, type SessionBody } from './store';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Do not try to refresh the session on 401 (auth and device endpoints). */
  skipRefresh?: boolean;
}

export type RefreshOutcome = 'ok' | 'expired' | 'unavailable';

let refreshInFlight: Promise<RefreshOutcome> | null = null;

const REFRESH_TIMEOUT_MS = 10_000;

/** Test hook: forget a refresh left pending by a previous test. */
export function resetRefreshState(): void {
  refreshInFlight = null;
}

/**
 * Restores or renews the session from the refresh cookie. Concurrent callers share one request.
 * Only a definite "no" from the server (4xx) signs the user out. A network failure or a 5xx
 * keeps the session: a cashier must not be thrown out by a 4G failover or a deploy.
 */
export function refreshSession(): Promise<RefreshOutcome> {
  refreshInFlight ??= (async (): Promise<RefreshOutcome> => {
    const session = useSession.getState();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.ok) {
        session.setSession((await res.json()) as SessionBody);
        return 'ok';
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        session.clear();
        return 'expired';
      }
      session.setUnreachable(true);
      return 'unavailable';
    } catch {
      session.setUnreachable(true);
      return 'unavailable';
    } finally {
      clearTimeout(timer);
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

const offline = () =>
  new ApiError(503, 'OFFLINE', 'Cannot reach the server. Check the internet connection.');

/** The `code` of an error response, read from a copy so the body stays readable. */
async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { code?: unknown };
    return typeof body.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Not JSON (e.g. an nginx error page).
  }
  const code = typeof body.code === 'string' ? body.code : `HTTP_${res.status}`;
  const message = typeof body.message === 'string' ? body.message : res.statusText;
  return new ApiError(res.status, code, message, body);
}

export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { ...request.headers };
    const token = useSession.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (request.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(path, {
      method: request.method ?? 'GET',
      credentials: 'include',
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
  };

  let res: Response;
  try {
    res = await send();
  } catch {
    throw offline();
  }
  // Only an expired or missing access token is worth a refresh. Other 401s (a wrong manager
  // PIN on an approval) must not be retried: a retry would count the wrong PIN twice.
  if (res.status === 401 && !request.skipRefresh && (await errorCode(res)) === 'UNAUTHENTICATED') {
    const outcome = await refreshSession();
    if (outcome === 'unavailable') throw offline();
    if (outcome === 'ok') res = await send();
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
