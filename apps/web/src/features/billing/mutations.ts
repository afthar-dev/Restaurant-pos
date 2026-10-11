import { useMutation, useQueryClient } from '@tanstack/react-query';
import { newId } from '@rpos/shared';
import { useRef } from 'react';
import { type Order, orderKeys, sendKot, useRefreshOrder } from '@/features/orders';
import { ApiError } from '@/shared/api/http';
import {
  addPayment,
  applyDiscount,
  changePaymentMode,
  createBill,
  setBillCustomer,
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
        sendKey.current ??= newId();
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
export function useAddPayment(bill: Bill, onRecorded: (updated: Bill) => void) {
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);
  const mutation = useMutation({
    mutationFn: (body: PaymentInput) => {
      requestId.current ??= newId();
      return addPayment(bill.id, requestId.current, body);
    },
    // Hook level, so the order still learns about the payment if the sheet closed meanwhile.
    onSuccess: (updated) => {
      requestId.current = null;
      onRecorded(updated);
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

/** Sets or clears the B2B customer on a bill, then reloads the order's bills. */
export function useSetCustomer(bill: Bill) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: (body: { name: string | null; gstin: string | null }) =>
      setBillCustomer(bill.id, body),
    onSuccess: () => refresh(bill.orderId),
  });
}

/** Fixes the mode of a payment taken today; the order's bills reload with the new mode. */
export function useChangePaymentMode(bill: Bill, paymentId: string) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: (body: Parameters<typeof changePaymentMode>[1]) =>
      changePaymentMode(paymentId, body),
    onSuccess: () => refresh(bill.orderId),
  });
}

export function useVoidBill(bill: Bill) {
  const refresh = useRefreshOrder();
  return useMutation({
    mutationFn: ({
      reason,
      overrideToken,
    }: {
      reason: { reasonCode: string; note?: string };
      overrideToken?: string;
    }) => voidBill(bill.id, reason, overrideToken),
    onSuccess: () => refresh(bill.orderId),
  });
}

/** The Print button: the bill printer when one is set up, otherwise this browser. */
export function usePrintBill(billId: string) {
  return useMutation({ mutationFn: () => printBill(billId) });
}
