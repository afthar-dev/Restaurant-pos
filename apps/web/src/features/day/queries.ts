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

export function useDayReport(dayId: string | undefined) {
  return useQuery({
    queryKey: dayKeys.report(dayId),
    queryFn: () => fetchDayReport(dayId!),
    enabled: Boolean(dayId),
  });
}
