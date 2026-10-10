import {
  useIsMutating,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { newId } from '@rpos/shared';
import { useRef } from 'react';
import {
  addItems,
  approveQrRequest,
  cancelLine,
  cancelOrder,
  markKotServed,
  mergeTable,
  moveTable,
  openParcelOrder,
  openTableOrder,
  rejectQrRequest,
  reprintKot,
  sendKot,
  setLineQuantity,
} from './api';
import { floorKeys, orderKeys, qrKeys } from './keys';
import type { FloorTableStatus, NewLine, Order, OrderLine, QrApproval } from './types';

/** Everything that shows an order: the order itself, the floor, the active list and its bills. */
export async function refreshOrder(client: QueryClient, orderId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: orderKeys.detail(orderId) }),
    client.invalidateQueries({ queryKey: floorKeys.all }),
    client.invalidateQueries({ queryKey: orderKeys.active() }),
    client.invalidateQueries({ queryKey: orderKeys.bills(orderId) }),
  ]);
}

export function useRefreshOrder() {
  const client = useQueryClient();
  return (orderId: string) => refreshOrder(client, orderId);
}

/** Seats guests at a free table. `onOpened` runs before the floor refreshes. */
export function useOpenTable(onOpened: (orderId: string) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, guests }: { tableId: string; guests: number }) =>
      openTableOrder(tableId, guests),
    onSuccess: async (order) => {
      onOpened(order.id);
      await client.invalidateQueries({ queryKey: floorKeys.all });
    },
  });
}

export function useOpenParcel(onOpened: (orderId: string) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: openParcelOrder,
    onSuccess: async (order) => {
      onOpened(order.id);
      await client.invalidateQueries({ queryKey: orderKeys.active() });
    },
  });
}

const addItemKey = (orderId: string) => ['add-item', orderId] as const;

/**
 * Adds one dish per call. Quick repeated taps are separate requests (no tile is locked while
 * an earlier dish saves); the order refreshes in the background.
 */
export function useAddItem(
  orderId: string,
  handlers: { onStart: () => void; onAdded: () => void; onError: (error: Error) => void },
) {
  const refresh = useRefreshOrder();
  const mutation = useMutation({
    mutationKey: addItemKey(orderId),
    mutationFn: (line: NewLine) => addItems(orderId, [line]),
    onMutate: handlers.onStart,
    onSuccess: () => {
      handlers.onAdded();
      void refresh(orderId);
    },
    onError: handlers.onError,
  });
  /** Dishes still saving, including taps from before the last re-render. */
  const saving = useIsMutating({ mutationKey: addItemKey(orderId) });
  return { add: mutation.mutate, isPending: mutation.isPending, saving };
}

/**
 * Sets a not-yet-sent line's quantity (0 removes it). If another screen changed the order
 * meanwhile, the server answers 409 and the order refreshes instead of being overwritten.
 */
export function useSetLineQuantity(order: Order, line: OrderLine) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: (quantity: number) => setLineQuantity(order, line.id, quantity),
    onSettled: () => refresh(order.id),
  });
}

export interface CancelLineInput {
  reason: string;
  quantity: number;
  /** Resolves a manager's approval when the user may not cancel sent dishes alone. */
  overrideToken?: () => Promise<string>;
}

export function useCancelLine(order: Order, line: OrderLine, onDone: () => void) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: async ({ reason, quantity, overrideToken }: CancelLineInput) =>
      cancelLine(order.id, line.id, { reason, quantity }, await overrideToken?.()),
    onSuccess: async () => {
      await refresh(order.id);
      onDone();
    },
  });
}

export function useCancelOrder(order: Order, onClosed?: () => void) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: (reason: string) => cancelOrder(order.id, reason),
    onSuccess: async () => {
      await refresh(order.id);
      onClosed?.();
    },
  });
}

/**
 * Sends the new dishes to the kitchen. One Idempotency-Key per send, kept after a failure so
 * a retry cannot create a second KOT; two taps faster than a re-render send only once.
 */
export function useSendKot(orderId: string) {
  const refresh = useRefreshOrder();
  const key = useRef<string | null>(null);
  const sending = useRef(false);
  const mutation = useMutation({
    mutationFn: () => {
      key.current ??= newId();
      return sendKot(orderId, key.current);
    },
    onSuccess: () => {
      key.current = null;
    },
    // Refresh on failure too: "nothing to send" usually means another screen already sent it.
    onSettled: async () => {
      sending.current = false;
      await refresh(orderId);
    },
  });
  const send = () => {
    if (sending.current) return;
    sending.current = true;
    mutation.mutate();
  };
  return { ...mutation, send };
}

export function useReprintKot(kotId: string, orderId: string) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: () => reprintKot(kotId),
    onSettled: () => refresh(orderId),
  });
}

export function useMarkServed(kotId: string, orderId: string) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: () => markKotServed(kotId),
    onSettled: () => refresh(orderId),
  });
}

/** Move the party to a free table, or bring a running table's order into this one. */
export function useTableChange(order: Order, mode: 'move' | 'merge', onDone: () => void) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: (table: FloorTableStatus) =>
      mode === 'move' ? moveTable(order, table.id) : mergeTable(order, table.order!.orderId),
    onSuccess: async () => {
      await refresh(order.id);
      onDone();
    },
  });
}

export type QrDecision =
  { action: 'approve'; body: QrApproval } | { action: 'reject'; body: { reason?: string } };

/** Approve (as sent or edited) or reject a QR request; two quick taps send once. */
export function useDecideQrRequest(order: Order, requestId: string) {
  const client = useQueryClient();
  const refresh = useRefreshOrder();
  const sending = useRef(false);
  const mutation = useMutation({
    mutationFn: (decision: QrDecision) =>
      decision.action === 'approve'
        ? approveQrRequest(requestId, decision.body)
        : rejectQrRequest(requestId, decision.body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: qrKeys.pending() });
      await refresh(order.id);
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const decide = (decision: QrDecision) => {
    if (sending.current) return;
    sending.current = true;
    mutation.mutate(decision);
  };
  return { ...mutation, decide };
}
