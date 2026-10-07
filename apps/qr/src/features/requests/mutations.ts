import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/features/cart';
import { sessionMeta } from '@/shared/api/queryClient';
import { submitOrder } from './api';
import { requestKeys } from './keys';
import type { OrderRequest } from './types';

/**
 * Sends the cart to the staff with the cart's request id, so a resend after a lost reply is
 * one order. On success the cart empties and the new request shows at once; on failure the
 * list reloads, because the order may have arrived although the reply was lost.
 */
export function useSubmitOrder(token: string) {
  const client = useQueryClient();
  const mine = requestKeys.mine(token);
  return useMutation({
    mutationFn: (note: string) => {
      const { lines, takeRequestId } = useCart.getState();
      return submitOrder(token, takeRequestId(), {
        lines: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          addonIds: l.addonIds,
          ...(l.note ? { note: l.note } : {}),
        })),
        ...(note ? { note } : {}),
      });
    },
    meta: sessionMeta(token),
    onSuccess: (sent) => {
      useCart.getState().clear();
      client.setQueryData<OrderRequest[]>(mine, (current = []) => [
        sent,
        ...current.filter((r) => r.id !== sent.id),
      ]);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: mine });
    },
  });
}
