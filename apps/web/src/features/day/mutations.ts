import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import { closeDay, openDay, reopenDay } from './api';
import { dayKeys } from './keys';
import type { CloseCheck, DayBlockers, DayReport } from './types';

export function useOpenDay() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: openDay,
    onSuccess: () => client.invalidateQueries({ queryKey: dayKeys.current }),
  });
}

/** Both the open day and the list of days change when a day closes or reopens. */
export function useRefreshDays() {
  const client = useQueryClient();
  return async () => {
    await client.invalidateQueries({ queryKey: dayKeys.current });
    await client.invalidateQueries({ queryKey: dayKeys.list });
  };
}

/**
 * Closes the day. When the server still finds open orders or unpaid bills, they replace the
 * close-check blockers at once (the next poll keeps them current as tables pay).
 */
export function useCloseDay(handlers: {
  onClosed: (report: DayReport) => void;
  onFailed: (error: Error, blocked: boolean) => void;
}) {
  const client = useQueryClient();
  const refreshDays = useRefreshDays();
  return useMutation({
    mutationFn: closeDay,
    onSuccess: async (report) => {
      handlers.onClosed(report);
      await refreshDays();
    },
    onError: (failure) => {
      const blocked = failure instanceof ApiError && failure.code === 'DAY_HAS_OPEN_WORK';
      if (blocked) {
        client.setQueryData<CloseCheck>(dayKeys.closeCheck, (current) =>
          current ? { ...current, blockers: failure.body.blockers as DayBlockers } : current,
        );
      }
      handlers.onFailed(failure, blocked);
    },
  });
}

export function useReopenDay(dayId: string, onReopened: () => void) {
  return useMutation({
    mutationFn: (reason: string) => reopenDay(dayId, reason),
    onSuccess: onReopened,
  });
}
