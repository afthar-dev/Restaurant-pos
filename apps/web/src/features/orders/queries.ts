import { useQuery } from '@tanstack/react-query';
import { POLL_MS } from '@/shared/api/queryClient';
import { fetchActiveOrders, fetchFloorStatus, fetchOrder, fetchQrPending } from './api';
import { floorKeys, orderKeys, qrKeys } from './keys';

export function useFloorStatus() {
  return useQuery({
    queryKey: floorKeys.status(),
    queryFn: fetchFloorStatus,
    refetchInterval: POLL_MS,
  });
}

export function useActiveOrders() {
  return useQuery({
    queryKey: orderKeys.active(),
    queryFn: fetchActiveOrders,
    refetchInterval: POLL_MS,
  });
}

export function useOrder(orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => fetchOrder(orderId!),
    enabled: Boolean(orderId),
    refetchInterval: POLL_MS,
  });
}

/** QR requests waiting for staff (only for staff who may approve them). */
export function useQrPending(enabled: boolean) {
  return useQuery({
    queryKey: qrKeys.pending(),
    queryFn: fetchQrPending,
    refetchInterval: POLL_MS,
    enabled,
  });
}
