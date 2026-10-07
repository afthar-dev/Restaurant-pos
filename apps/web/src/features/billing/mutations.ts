import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { type Order, orderKeys, sendKot, useRefreshOrder } from '@/features/orders';
import { ApiError } from '@/shared/api/http';
import {
  addPayment,
  applyDiscount,
  createBill,
  voidBill,
  type BillLineChoice,
  type PaymentInput,
} from './api';
import { printBill } from './printBill';
import type { Bill } from './types';

/**
 * Bills the order (or the chosen lines). A parcel's unsent dishes go to the kitchen first;
 * that send keeps its Idempotency-Key across a retry, so a retry never makes a second KOT.
 */
export function useCreateBill(
  order: Order,
  onCreated: (bill: Bill & { printQueued?: number }) => Promise<void>,
) {
  const refresh = useRefreshOrder();
  const sendKey = useRef<string | null>(null);
  const newLines = order.items.filter((i) => i.status === 'NEW');
  return useMutation({
    mutationFn: async (lines?: BillLineChoice[]) => {
      let sentNow = false;
      if (newLines.length > 0) {
        sendKey.current ??= crypto.randomUUID();
        await sendKot(order.id, sendKey.current);
        sendKey.current = null;
        sentNow = true;
      }
      return createBill(order, lines, !sentNow);
    },
    onSuccess: onCreated,
    onSettled: () => refresh(order.id),
  });
}

/** Applies a bill discount; a bill changed elsewhere (409) is reloaded. */
export function useApplyDiscount(bill: Bill) {
  const client = useQueryClient();
  const bills = orderKeys.bills(bill.orderId);
  return useMutation({
    mutationFn: ({ body, overrideToken }: { body: object; overrideToken?: string }) =>
      applyDiscount(bill, body, overrideToken),
    onSuccess: () => client.invalidateQueries({ queryKey: bills }),
    onError: (failure) => {
      if (failure instanceof ApiError && failure.code === 'BILL_CHANGED') {
        void client.invalidateQueries({ queryKey: bills });
      }
    },
  });
}

/**
 * Records a payment. One Idempotency-Key per payment, kept after a failure so a retry is
 * recorded once; two taps faster than a re-render record once.
 */
export function useAddPayment(bill: Bill) {
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);
  const mutation = useMutation({
    mutationFn: (body: PaymentInput) => {
      requestId.current ??= crypto.randomUUID();
      return addPayment(bill.id, requestId.current, body);
    },
    onSuccess: () => {
      requestId.current = null;
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const pay = (
    body: PaymentInput,
    callbacks: { onSuccess: (updated: Bill) => void; onError: (error: Error) => void },
  ) => {
    if (sending.current) return;
    sending.current = true;
    mutation.mutate(body, callbacks);
  };
  return { ...mutation, pay, isSending: () => sending.current };
}

export function useVoidBill(bill: Bill) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: ({ reason, overrideToken }: { reason: string; overrideToken?: string }) =>
      voidBill(bill.id, reason, overrideToken),
    onSuccess: () => refresh(bill.orderId),
  });
}

/** The Print button: the bill printer when one is set up, otherwise this browser. */
export function usePrintBill(billId: string) {
  return useMutation({ mutationFn: () => printBill(billId) });
}
