import { useInfiniteQuery } from '@tanstack/react-query';
import { AUDIT_PAGE_SIZE, fetchAuditPage } from './api';

export const auditKeys = { log: ['audit'] as const };

export function useAuditLog() {
  return useInfiniteQuery({
    queryKey: auditKeys.log,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchAuditPage(pageParam),
    getNextPageParam: (last) =>
      last.length === AUDIT_PAGE_SIZE ? (last[last.length - 1]?.createdAt ?? null) : null,
  });
}
