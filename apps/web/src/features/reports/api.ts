import { apiFetch } from '@/shared/api/http';
import type { DateRange } from './ranges';
import type { AccountabilityReport, SalesReport } from './types';

export const fetchSalesReport = ({ from, to }: DateRange) =>
  apiFetch<SalesReport>(
    `/api/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

/** One business day, whatever date it was opened on. */
export const fetchDaySalesReport = (businessDayId: string) =>
  apiFetch<SalesReport>(`/api/reports/sales?businessDayId=${encodeURIComponent(businessDayId)}`);

export const fetchAccountability = ({ from, to }: DateRange) =>
  apiFetch<AccountabilityReport>(
    `/api/reports/accountability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
