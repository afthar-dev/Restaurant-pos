import { healthResponseSchema, type HealthResponse } from '@rpos/shared';

/** Throws on network failure or when the body is not a valid health response. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal });
  const body: unknown = await res.json();
  return healthResponseSchema.parse(body);
}
