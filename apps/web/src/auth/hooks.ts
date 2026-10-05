import type { DeviceType, Role } from '@rpos/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiFetch, ApiError, refreshSession } from './api';
import { useSession } from './store';

/** On first render, try to restore the session from the refresh cookie. */
export function useBootSession(): void {
  const status = useSession((s) => s.status);
  useEffect(() => {
    if (status === 'loading') void refreshSession();
  }, [status]);
}

export interface CurrentDevice {
  id: string;
  name: string;
  type: DeviceType;
}

/** The registered device this browser belongs to, or null when it is not registered. */
export function useCurrentDevice() {
  return useQuery({
    queryKey: ['device', 'current'],
    queryFn: async (): Promise<CurrentDevice | null> => {
      try {
        return await apiFetch<CurrentDevice>('/api/devices/current', { skipRefresh: true });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export interface StaffOption {
  id: string;
  name: string;
  role: Role;
}

export function useDeviceStaff(enabled: boolean) {
  return useQuery({
    queryKey: ['device', 'staff'],
    queryFn: () => apiFetch<StaffOption[]>('/api/auth/staff', { skipRefresh: true }),
    enabled,
  });
}
