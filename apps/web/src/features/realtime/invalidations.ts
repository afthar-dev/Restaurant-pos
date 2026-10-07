import type { QueryKey } from '@tanstack/react-query';
import { dayKeys } from '@/features/day';
import { expenseKeys } from '@/features/expenses';
import { kitchenKeys } from '@/features/kitchen';
import { menuKeys } from '@/features/menu';
import { floorKeys, orderKeys, qrKeys } from '@/features/orders';
import { printKeys } from '@/features/printing';
import { stockKeys } from '@/features/stock';

type Payload = Record<string, unknown>;

const orderId = (p: Payload) => p.orderId as string;

/** What each server notice makes stale. Payloads carry ids only; data is refetched. */
export const INVALIDATIONS: Record<string, (payload: Payload) => QueryKey[]> = {
  'order.updated': (p) => [
    orderKeys.detail(orderId(p)),
    orderKeys.bills(orderId(p)),
    floorKeys.all,
    orderKeys.active(),
    qrKeys.pending(),
    // A moved order shows its new table on the kitchen screen.
    kitchenKeys.all,
  ],
  'qr.submitted': (p) => [
    qrKeys.pending(),
    floorKeys.all,
    orderKeys.active(),
    orderKeys.detail(orderId(p)),
  ],
  'bill.updated': (p) => [
    orderKeys.bills(orderId(p)),
    orderKeys.detail(orderId(p)),
    orderKeys.active(),
    floorKeys.all,
  ],
  'kot.created': (p) => [kitchenKeys.all, orderKeys.detail(orderId(p))],
  'kot.updated': (p) => [kitchenKeys.all, orderKeys.detail(orderId(p))],
  'menu.availability': () => [menuKeys.all],
  // A closed or reopened day changes which purchases and expenses can still be voided.
  'day.updated': () => [dayKeys.current, expenseKeys.all, stockKeys.all],
  'print.job': () => [printKeys.jobs],
  'expense.updated': () => [expenseKeys.all, dayKeys.closeCheck],
  'stock.updated': () => [stockKeys.all],
};
