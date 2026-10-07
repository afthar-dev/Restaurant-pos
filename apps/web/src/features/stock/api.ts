import { apiFetch } from '@/shared/api/http';
import type { NewPurchase, Purchase, StockItem, StockItemInput, StockTxn } from './types';

export const fetchStockItems = () => apiFetch<StockItem[]>('/api/stock/items');

export const saveStockItem = (existing: StockItem | null, body: StockItemInput) =>
  existing
    ? apiFetch<StockItem>(`/api/stock/items/${existing.id}`, { method: 'PUT', body })
    : apiFetch<StockItem>('/api/stock/items', { method: 'POST', body });

export const archiveStockItem = (item: StockItem) =>
  apiFetch(`/api/stock/items/${item.id}/archive`, { method: 'POST' });

export const adjustStock = ({
  id,
  qtyMilli,
  reason,
}: {
  id: string;
  qtyMilli: number;
  reason: string;
}) =>
  apiFetch<StockItem>(`/api/stock/items/${id}/adjust`, {
    method: 'POST',
    body: { qtyMilli, reason },
  });

export const countStock = ({
  id,
  countedMilli,
  note,
}: {
  id: string;
  countedMilli: number;
  note?: string;
}) =>
  apiFetch<{ difference: number; item: StockItem }>(`/api/stock/items/${id}/count`, {
    method: 'POST',
    body: { countedMilli, ...(note ? { note } : {}) },
  });

export const fetchStockTxns = (id: string) => apiFetch<StockTxn[]>(`/api/stock/items/${id}/txns`);

export const fetchPurchases = (day: string) =>
  apiFetch<Purchase[]>(`/api/purchases?day=${encodeURIComponent(day)}`);

export const createPurchase = (idempotencyKey: string, body: NewPurchase) =>
  apiFetch<Purchase>('/api/purchases', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body,
  });

export const voidPurchase = ({ id, reason }: { id: string; reason: string }) =>
  apiFetch<Purchase>(`/api/purchases/${id}/void`, { method: 'POST', body: { reason } });
