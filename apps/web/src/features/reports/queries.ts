import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAccountability, fetchDaySalesReport, fetchSalesReport } from './api';
import { reportKeys } from './keys';
import type { DateRange } from './ranges';

/** How often a report left open on a screen asks again, in case a notice was missed. */
export const REPORT_POLL_MS = 60_000;

/**
 * Keeps the previous report on screen while another range loads. `poll` re-asks every minute,
 * for a screen that stays open all evening (Home).
 */
export function useSalesReport(range: DateRange, { poll = false } = {}) {
  return useQuery({
    refetchInterval: poll ? REPORT_POLL_MS : false,
    queryKey: reportKeys.sales(range),
    queryFn: () => fetchSalesReport(range),
    placeholderData: keepPreviousData,
  });
}

/** One business day's figures, so a day that runs past midnight stays in one piece. */
export function useDaySalesReport(dayId: string, { poll = false } = {}) {
  return useQuery({
    refetchInterval: poll ? REPORT_POLL_MS : false,
    queryKey: reportKeys.day(dayId),
    queryFn: () => fetchDaySalesReport(dayId),
  });
}

/** Discounts, voids, cancelled dishes and reprints by reason and by staff member. */
export function useAccountability(range: DateRange) {
  return useQuery({
    queryKey: reportKeys.accountability(range),
    queryFn: () => fetchAccountability(range),
    placeholderData: keepPreviousData,
  });
}
