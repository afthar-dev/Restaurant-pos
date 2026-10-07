import { useQuery } from '@tanstack/react-query';
import { orderKeys } from '@/features/orders';
import { POLL_MS } from '@/shared/api/queryClient';
import { fetchOrderBills } from './api';

export function useOrderBills(orderId: string) {
  return useQuery({
    queryKey: orderKeys.bills(orderId),
    queryFn: () => fetchOrderBills(orderId),
    refetchInterval: POLL_MS,
  });
}
