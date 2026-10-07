import { apiFetch } from '@/shared/api/http';
import type { DateRange } from './ranges';
import type { SalesReport } from './types';

export const fetchSalesReport = ({ from, to }: DateRange) =>
  apiFetch<SalesReport>(
    `/api/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
