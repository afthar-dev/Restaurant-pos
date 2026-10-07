import { describe, expect, it } from 'vitest';
import { ApiError } from './http';
import { shouldRetry } from './queryClient';

describe('shouldRetry', () => {
  it('does not retry a 4xx answer', () => {
    expect(shouldRetry(0, new ApiError(404, 'NOT_FOUND', 'Not found'))).toBe(false);
    expect(shouldRetry(0, new ApiError(403, 'FORBIDDEN', 'No'))).toBe(false);
  });

  it('retries network failures, 5xx, 408 and 429 up to three times', () => {
    expect(shouldRetry(0, new ApiError(503, 'OFFLINE', 'Offline'))).toBe(true);
    expect(shouldRetry(1, new ApiError(429, 'TOO_MANY_REQUESTS', 'Slow down'))).toBe(true);
    expect(shouldRetry(2, new TypeError('fetch failed'))).toBe(true);
    expect(shouldRetry(3, new ApiError(500, 'HTTP_500', 'Boom'))).toBe(false);
  });
});
