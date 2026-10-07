import type { DeviceType, Role } from '@rpos/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiFetch, ApiError, refreshSession } from '@/shared/api/http';
import { useSession } from '@/shared/session/store';

const BOOT_RETRY_MS = 5000;

/**
 * On first render, restore the session from the refresh cookie. If the server cannot be
 * reached, keep trying every few seconds instead of sending staff to the sign-in screen.
 */
export function useBootSession(): void {
  const status = useSession((s) => s.status);
  useEffect(() => {
    if (status !== 'loading') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const outcome = await refreshSession();
      if (!cancelled && outcome === 'unavailable')
        timer = setTimeout(() => void attempt(), BOOT_RETRY_MS);
    };
    void attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status]);
}

export interface CurrentDevice {
  id: string;
  name: string;
  type: DeviceType;
}

export const DEVICE_RETRY_MS = 5_000;

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
    // A screen that booted before the network came up must keep trying: the kitchen TV and
    // the printing counter never get a focus event to trigger a refetch.
    refetchInterval: (query) => (query.state.status === 'error' ? DEVICE_RETRY_MS : false),
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
