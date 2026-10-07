import type { DeviceType, Permission, Role } from '@rpos/shared';
import { apiFetch } from '@/shared/api/http';
import type { SessionBody } from '@/shared/session/store';

export interface CurrentDevice {
  id: string;
  name: string;
  type: DeviceType;
}

export interface StaffOption {
  id: string;
  name: string;
  role: Role;
}

export interface Approver {
  id: string;
  name: string;
}

// Sign-in and device calls skip the refresh: a 401 there means "wrong secret" or "not
// registered", never an expired session.
export const login = (credentials: { phone: string; password: string }) =>
  apiFetch<SessionBody>('/api/auth/login', {
    method: 'POST',
    body: credentials,
    skipRefresh: true,
  });

export const pinLogin = (input: { userId: string; pin: string }) =>
  apiFetch<SessionBody>('/api/auth/pin-login', { method: 'POST', body: input, skipRefresh: true });

export const logout = () => apiFetch('/api/auth/logout', { method: 'POST', skipRefresh: true });

export const fetchCurrentDevice = () =>
  apiFetch<CurrentDevice>('/api/devices/current', { skipRefresh: true });

export const fetchDeviceStaff = () =>
  apiFetch<StaffOption[]>('/api/auth/staff', { skipRefresh: true });

export const fetchApprovers = () => apiFetch<Approver[]>('/api/auth/approvers');

/** Asks the server for a one-time approval token for `permission`, signed by that manager. */
export async function requestOverride(
  userId: string,
  pin: string,
  permission: Permission,
): Promise<string> {
  const { overrideToken } = await apiFetch<{ overrideToken: string }>('/api/auth/override', {
    method: 'POST',
    body: { userId, pin, permission },
  });
  return overrideToken;
}
