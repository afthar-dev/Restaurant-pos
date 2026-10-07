import { apiFetch } from '@/shared/api/http';
import type { Printer, Station } from './types';

export const fetchStations = () => apiFetch<Station[]>('/api/stations');

export const addStation = (body: { name: string }) =>
  apiFetch('/api/stations', { method: 'POST', body });

export const renameStation = ({ id, name }: { id: string; name: string }) =>
  apiFetch(`/api/stations/${id}`, { method: 'PUT', body: { name } });

export const archiveStation = (station: Station) =>
  apiFetch(`/api/stations/${station.id}/archive`, { method: 'POST' });

export const fetchPrinters = () => apiFetch<Printer[]>('/api/printers');

export const savePrinter = (existing: Printer | null, body: object) =>
  existing
    ? apiFetch(`/api/printers/${existing.id}`, { method: 'PUT', body })
    : apiFetch('/api/printers', { method: 'POST', body });

export const archivePrinter = (printer: Printer) =>
  apiFetch(`/api/printers/${printer.id}/archive`, { method: 'POST' });
