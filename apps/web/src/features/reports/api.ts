import { apiFetch } from '@/shared/api/http';
import type { DateRange } from './ranges';
import type { SalesReport } from './types';

export const fetchSalesReport = ({ from, to }: DateRange) =>
  apiFetch<SalesReport>(
    `/api/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

/** One business day, whatever date it was opened on. */
export const fetchDaySalesReport = (businessDayId: string) =>
  apiFetch<SalesReport>(`/api/reports/sales?businessDayId=${encodeURIComponent(businessDayId)}`);
