import type { TableCode } from '@/features/printing';
import { apiFetch } from '@/shared/api/http';
import type { FloorArea, FloorTable } from './types';

export const fetchLayout = () => apiFetch<FloorArea[]>('/api/floor');

export const addArea = (body: object) => apiFetch('/api/areas', { method: 'POST', body });

export const renameArea = ({ area, name }: { area: FloorArea; name: string }) =>
  apiFetch(`/api/areas/${area.id}`, { method: 'PUT', body: { name, sortOrder: area.sortOrder } });

export const archiveArea = (area: FloorArea) =>
  apiFetch(`/api/areas/${area.id}/archive`, { method: 'POST' });

export const addTable = (body: object) => apiFetch('/api/tables', { method: 'POST', body });

export const updateTable = (table: FloorTable, body: object) =>
  apiFetch(`/api/tables/${table.id}`, { method: 'PUT', body });

export const archiveTable = (table: FloorTable) =>
  apiFetch(`/api/tables/${table.id}/archive`, { method: 'POST' });

export const fetchTableCodes = () => apiFetch<TableCode[]>('/api/tables/qr');

/** A new sticker code; the old sticker stops working. */
export const rotateTableCode = (table: TableCode) =>
  apiFetch<{ id: string; qrToken: string }>(`/api/tables/${table.id}/qr/rotate`, {
    method: 'POST',
  });
