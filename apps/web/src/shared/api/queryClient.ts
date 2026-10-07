import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

/** Screens also poll, so they recover even if realtime notices are lost. */
export const POLL_MS = 15_000;

const MAX_RETRIES = 3;

/** A 4xx answer will not change on retry (except 408 and 429); network and 5xx errors may. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return error.status === 408 || error.status === 429;
  }
  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
}
