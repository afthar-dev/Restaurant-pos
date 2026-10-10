import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchDaySalesReport, fetchSalesReport } from './api';
import { reportKeys } from './keys';
import type { DateRange } from './ranges';

/** Keeps the previous report on screen while another range loads. */
export function useSalesReport(range: DateRange) {
  return useQuery({
    queryKey: reportKeys.sales(range),
    queryFn: () => fetchSalesReport(range),
    placeholderData: keepPreviousData,
  });
}

/** One business day's figures, so a day that runs past midnight stays in one piece. */
export function useDaySalesReport(dayId: string) {
  return useQuery({
    queryKey: reportKeys.day(dayId),
    queryFn: () => fetchDaySalesReport(dayId),
  });
}
