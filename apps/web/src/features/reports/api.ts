import { apiFetch } from '@/shared/api/http';
import type { DateRange } from './ranges';
import type { AccountabilityReport, GstReport, SalesReport } from './types';

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

const rangeQuery = ({ from, to }: DateRange) =>
  `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

/** GST figures by invoice date (India time). */
export const fetchGstReport = (range: DateRange) =>
  apiFetch<GstReport>(`/api/reports/gst?${rangeQuery(range)}`);

/** The bill register as CSV text (sent with the session, so it is fetched, not linked). */
export const fetchBillRegister = (range: DateRange) =>
  apiFetch<string>(`/api/reports/bill-register.csv?${rangeQuery(range)}`, { as: 'text' });
