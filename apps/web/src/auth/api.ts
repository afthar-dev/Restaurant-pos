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

let refreshInFlight: Promise<boolean> | null = null;

/** Restores or renews the session from the refresh cookie. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        useSession.getState().clear();
        return false;
      }
      useSession.getState().setSession((await res.json()) as SessionBody);
      return true;
    } catch {
      useSession.getState().clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
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

  let res = await send();
  if (res.status === 401 && !request.skipRefresh && (await refreshSession())) {
    res = await send();
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
