import { useQuery } from '@tanstack/react-query';
import { sessionMeta } from '@/shared/api/queryClient';
import { fetchMenu } from './api';
import { menuKeys } from './keys';

/** What this table can order right now (the server leaves out dishes that ran out). */
export function useMenu(token: string) {
  return useQuery({
    queryKey: menuKeys.forSession(token),
    queryFn: () => fetchMenu(token),
    meta: sessionMeta(token),
  });
}
