import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from './api';

export const healthKeys = { status: ['health'] as const };

/** Polls /api/health so staff see at once when the server or database is unreachable. */
export function useServerHealth() {
  return useQuery({
    queryKey: healthKeys.status,
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 10_000,
    retry: false,
    // Default 'online' mode pauses while the browser thinks it is offline and keeps the last
    // "Server online" result. This check exists to report exactly that situation.
    networkMode: 'always',
  });
}
