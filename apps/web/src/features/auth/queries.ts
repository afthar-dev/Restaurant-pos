import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import { fetchApprovers, fetchCurrentDevice, fetchDeviceStaff, type CurrentDevice } from './api';
import { authKeys } from './keys';

export const DEVICE_RETRY_MS = 5_000;

/** The registered device this browser belongs to, or null when it is not registered. */
export function useCurrentDevice() {
  return useQuery({
    queryKey: authKeys.currentDevice,
    queryFn: async (): Promise<CurrentDevice | null> => {
      try {
        return await fetchCurrentDevice();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    // A screen that booted before the network came up must keep trying: the kitchen TV and
    // the printing counter never get a focus event to trigger a refetch.
    refetchInterval: (query) => (query.state.status === 'error' ? DEVICE_RETRY_MS : false),
  });
}

export function useDeviceStaff(enabled: boolean) {
  return useQuery({ queryKey: authKeys.deviceStaff, queryFn: fetchDeviceStaff, enabled });
}

/** Managers who may approve an action with their PIN. */
export function useApprovers() {
  return useQuery({ queryKey: authKeys.approvers, queryFn: fetchApprovers });
}
