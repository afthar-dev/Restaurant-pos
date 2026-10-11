import { useQuery } from '@tanstack/react-query';
import { POLL_MS } from '@/shared/api/queryClient';
import { fetchCloseCheck, fetchCurrentDay, fetchDayReport, fetchDays } from './api';
import { dayKeys } from './keys';

export function useBusinessDay() {
  return useQuery({
    queryKey: dayKeys.current,
    queryFn: fetchCurrentDay,
    refetchInterval: POLL_MS,
  });
}

/** What still blocks closing the day, and the cash expected in the drawer. */
export function useCloseCheck() {
  return useQuery({
    queryKey: dayKeys.closeCheck,
    queryFn: fetchCloseCheck,
    refetchInterval: POLL_MS,
  });
}

export function usePastDays() {
  return useQuery({ queryKey: dayKeys.list, queryFn: fetchDays });
}

/** How often a day report left open on a screen asks again, in case a notice was missed. */
const DAY_REPORT_POLL_MS = 60_000;

/** `poll` re-asks every minute, for a screen that stays open all evening (Home). */
export function useDayReport(dayId: string | undefined, { poll = false } = {}) {
  return useQuery({
    refetchInterval: poll ? DAY_REPORT_POLL_MS : false,
    queryKey: dayKeys.report(dayId),
    queryFn: () => fetchDayReport(dayId!),
    enabled: Boolean(dayId),
  });
}
