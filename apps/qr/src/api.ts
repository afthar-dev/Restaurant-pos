export class QrApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'QrApiError';
  }
}

export const isSessionEnded = (error: unknown) =>
  error instanceof QrApiError && error.code === 'QR_SESSION_ENDED';

const OFFLINE = 'No connection. Check your internet and try again.';
const REQUEST_TIMEOUT_MS = 15_000;

/** JSON request to the restaurant's server; the QR session rides in its own header. */
export async function qrFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['x-qr-session'] = options.token;
  // On weak mobile data a request can stall for minutes instead of failing: give up so the
  // diner can try again (a resend reuses the same request id, so nothing is ordered twice).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new QrApiError(0, 'OFFLINE', OFFLINE);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let body: { code?: string; message?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // Not JSON (a proxy error page).
    }
    throw new QrApiError(
      res.status,
      body.code ?? `HTTP_${res.status}`,
      body.message ?? 'Something went wrong. Please call the waiter.',
    );
  }
  return (await res.json()) as T;
}
