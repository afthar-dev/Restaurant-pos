import type { PaymentMode } from '@rpos/shared';
import type { BillPrintPayload } from '@/features/printing';
import { apiFetch } from '@/shared/api/http';
import type { Bill } from './types';

type Versioned = { id: string; version: number };

const overrideHeader = (token?: string): Record<string, string> =>
  token ? { 'x-override-token': token } : {};

export const fetchOrderBills = (orderId: string) =>
  apiFetch<Bill[]>(`/api/orders/${orderId}/bills`);

export interface BillLineChoice {
  orderItemId: string;
  quantity: number;
}

/**
 * Creates a bill for all unbilled dishes, or for `lines` (split bill). `checkVersion` is off
 * right after sending dishes: the order version moved on, the server still checks quantities.
 */
export const createBill = (order: Versioned, lines?: BillLineChoice[], checkVersion = true) =>
  apiFetch<Bill & { printQueued?: number }>(`/api/orders/${order.id}/bills`, {
    method: 'POST',
    headers: checkVersion ? { 'If-Match': String(order.version) } : {},
    body: lines ? { lines } : {},
  });

export const applyDiscount = (bill: Versioned, body: object, overrideToken?: string) =>
  apiFetch(`/api/bills/${bill.id}/discount`, {
    method: 'PUT',
    headers: { 'If-Match': String(bill.version), ...overrideHeader(overrideToken) },
    body,
  });

export const setBillCustomer = (
  billId: string,
  body: { name: string | null; gstin: string | null },
) => apiFetch<Bill>(`/api/bills/${billId}/customer`, { method: 'PATCH', body });

export interface PaymentInput {
  mode: PaymentMode;
  amount: number;
  tendered?: number;
  reference?: string;
}

export const addPayment = (billId: string, idempotencyKey: string, body: PaymentInput) =>
  apiFetch<Bill>(`/api/bills/${billId}/payments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body,
  });

export const voidBill = (billId: string, reason: string, overrideToken?: string) =>
  apiFetch(`/api/bills/${billId}/void`, {
    method: 'POST',
    headers: overrideHeader(overrideToken),
    body: { reason },
  });

export const fetchBillPrintPayload = (billId: string, paperWidthMm: 58 | 80) =>
  apiFetch<BillPrintPayload>(`/api/bills/${billId}/print-payload?paperWidthMm=${paperWidthMm}`);

/** Queues the bill on the bill printer; `queued` is 0 when no bill printer is set up. */
export const queueBillPrint = (billId: string) =>
  apiFetch<{ queued: number; copy: number }>(`/api/bills/${billId}/print`, { method: 'POST' });
