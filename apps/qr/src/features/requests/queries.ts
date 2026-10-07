import { useQuery } from '@tanstack/react-query';
import { sessionMeta } from '@/shared/api/queryClient';
import { fetchMyRequests } from './api';
import { requestKeys } from './keys';
import type { OrderRequest } from './types';

/** While anything waits for staff, check for their decision this often. */
export const STATUS_POLL_MS = 5_000;

const waiting = (requests: OrderRequest[] | undefined) =>
  requests?.some((r) => r.status === 'PENDING') ?? false;

/** What this phone has sent, polled only while the staff have not decided yet. */
export function useMyRequests(token: string) {
  return useQuery({
    queryKey: requestKeys.mine(token),
    queryFn: () => fetchMyRequests(token),
    meta: sessionMeta(token),
    refetchInterval: (query) => (waiting(query.state.data) ? STATUS_POLL_MS : false),
  });
}
