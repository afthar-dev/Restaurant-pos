import { apiFetch } from '@/shared/api/http';
import type { BusinessDay, CloseCheck, DayReport, DaySummary } from './types';

export const fetchCurrentDay = () =>
  apiFetch<{ day: BusinessDay | null }>('/api/business-day/current');

export const openDay = (openingCash: number) =>
  apiFetch('/api/business-day/open', { method: 'POST', body: { openingCash } });

export const fetchCloseCheck = () => apiFetch<CloseCheck>('/api/business-day/close-check');

export const closeDay = (body: { countedCash: number; note?: string }) =>
  apiFetch<DayReport>('/api/business-day/close', { method: 'POST', body });

export const reopenDay = (dayId: string, reason: string) =>
  apiFetch(`/api/business-day/${dayId}/reopen`, { method: 'POST', body: { reason } });

export const fetchDays = () => apiFetch<DaySummary[]>('/api/business-day?limit=30');

export const fetchDayReport = (dayId: string) =>
  apiFetch<DayReport>(`/api/business-day/${dayId}/report`);
