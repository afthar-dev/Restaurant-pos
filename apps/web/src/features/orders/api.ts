import type { KotReprintRequest } from '@rpos/shared';
import { apiFetch } from '@/shared/api/http';
import type { ActiveOrder, FloorAreaStatus, NewLine, Order, QrApproval, QrRequest } from './types';

type Versioned = Pick<Order, 'id' | 'version'>;

const ifMatch = (order: Versioned) => ({ 'If-Match': String(order.version) });

export const fetchFloorStatus = () => apiFetch<FloorAreaStatus[]>('/api/floor/status');

export const fetchActiveOrders = () => apiFetch<ActiveOrder[]>('/api/orders?status=active');

export const fetchOrder = (orderId: string) => apiFetch<Order>(`/api/orders/${orderId}`);

export const openTableOrder = (tableId: string, guests: number) =>
  apiFetch<{ id: string }>('/api/orders', {
    method: 'POST',
    body: { type: 'DINE_IN', tableId, guests },
  });

export const openParcelOrder = () =>
  apiFetch<{ id: string }>('/api/orders', { method: 'POST', body: { type: 'PARCEL' } });

export const addItems = (orderId: string, items: NewLine[]) =>
  apiFetch(`/api/orders/${orderId}/items`, { method: 'POST', body: { items } });

/** Quantities are absolute; the version makes the server refuse a stale change (409). */
export const setLineQuantity = (order: Versioned, lineId: string, quantity: number) =>
  quantity === 0
    ? apiFetch(`/api/orders/${order.id}/items/${lineId}`, {
        method: 'DELETE',
        headers: ifMatch(order),
      })
    : apiFetch(`/api/orders/${order.id}/items/${lineId}`, {
        method: 'PATCH',
        headers: ifMatch(order),
        body: { quantity },
      });

export const cancelLine = (
  orderId: string,
  lineId: string,
  body: { reason: string; quantity: number },
  overrideToken?: string,
) =>
  apiFetch(`/api/orders/${orderId}/items/${lineId}/cancel`, {
    method: 'POST',
    headers: overrideToken ? { 'x-override-token': overrideToken } : {},
    body,
  });

export const cancelOrder = (orderId: string, reason: string) =>
  apiFetch(`/api/orders/${orderId}/cancel`, { method: 'POST', body: { reason } });

export const sendKot = (orderId: string, idempotencyKey: string) =>
  apiFetch(`/api/orders/${orderId}/kot`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
  });

export const reprintKot = (kotId: string, body: KotReprintRequest) =>
  apiFetch(`/api/kots/${kotId}/reprint`, { method: 'POST', body });

export const markKotServed = (kotId: string) =>
  apiFetch(`/api/kots/${kotId}/served`, { method: 'POST' });

export const moveTable = (order: Versioned, tableId: string) =>
  apiFetch(`/api/orders/${order.id}/move`, {
    method: 'POST',
    headers: ifMatch(order),
    body: { tableId },
  });

export const mergeTable = (order: Versioned, fromOrderId: string) =>
  apiFetch(`/api/orders/${order.id}/merge`, {
    method: 'POST',
    headers: ifMatch(order),
    body: { fromOrderId },
  });

export const fetchQrPending = () => apiFetch<QrRequest[]>('/api/qr/pending');

export const approveQrRequest = (requestId: string, body: QrApproval) =>
  apiFetch(`/api/qr/submissions/${requestId}/approve`, { method: 'POST', body });

export const rejectQrRequest = (requestId: string, body: { reason?: string }) =>
  apiFetch(`/api/qr/submissions/${requestId}/reject`, { method: 'POST', body });
