import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchSalesReport } from './api';
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
