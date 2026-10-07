import { qrFetch } from '@/shared/api/http';
import type { OrderRequest } from './types';

export interface OrderInput {
  lines: { variantId: string; quantity: number; addonIds: string[]; note?: string }[];
  note?: string;
}

export const fetchMyRequests = (token: string) =>
  qrFetch<OrderRequest[]>('/api/qr/orders', { token });

export const submitOrder = (token: string, requestId: string, body: OrderInput) =>
  qrFetch<OrderRequest>('/api/qr/orders', {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': requestId },
    body,
  });
