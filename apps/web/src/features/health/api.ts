import { healthResponseSchema, type HealthResponse } from '@rpos/shared';

export const HEALTH_TIMEOUT_MS = 5000;

/**
 * Throws on network failure, on a body that is not a valid health response, or when the
 * server does not answer within `timeoutMs` (a dropped uplink can otherwise hang for minutes).
 */
export async function fetchHealth(
  signal?: AbortSignal,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<HealthResponse> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Health check timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    const res = await fetch('/api/health', { signal: controller.signal });
    const body: unknown = await res.json();
    return healthResponseSchema.parse(body);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
