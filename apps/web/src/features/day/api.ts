import { apiFetch } from '@/shared/api/http';
import type { CloseCount } from '@rpos/shared';
import type {
  BlindCloseCheck,
  BusinessDay,
  CloseCheck,
  CountCheck,
  DayReport,
  DaySummary,
} from './types';

export const fetchCurrentDay = () =>
  apiFetch<{ day: BusinessDay | null }>('/api/business-day/current');

export const openDay = (openingCash: number) =>
  apiFetch('/api/business-day/open', { method: 'POST', body: { openingCash } });

export const fetchCloseCheck = () => apiFetch<CloseCheck>('/api/business-day/close-check');

export const fetchBlindCloseCheck = () =>
  apiFetch<BlindCloseCheck>('/api/business-day/close-check?blind=1');

export const checkCount = (dayId: string, countedCash: number) =>
  apiFetch<CountCheck>(`/api/business-day/${dayId}/close/check-count`, {
    method: 'POST',
    body: { countedCash },
  });

export interface CloseRequest {
  countedCash: number;
  count?: CloseCount;
  reasonCode?: string;
  note?: string;
}

export const closeDay = (body: CloseRequest) =>
  apiFetch<DayReport>('/api/business-day/close', { method: 'POST', body });

export const reopenDay = (dayId: string, reason: string) =>
  apiFetch(`/api/business-day/${dayId}/reopen`, { method: 'POST', body: { reason } });

export const fetchDays = () => apiFetch<DaySummary[]>('/api/business-day?limit=30');

export const fetchDayReport = (dayId: string) =>
  apiFetch<DayReport>(`/api/business-day/${dayId}/report`);
