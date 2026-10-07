import type { DeviceType } from '@rpos/shared';
import { apiFetch } from '@/shared/api/http';
import type { DeviceRow } from './types';

export const fetchDevices = () => apiFetch<DeviceRow[]>('/api/devices');

/** Registers this browser; the server sets the device cookie. */
export const registerDevice = (body: { name: string; type: DeviceType }) =>
  apiFetch<{ id: string; name: string; type: DeviceType }>('/api/devices', {
    method: 'POST',
    body,
  });

export const revokeDevice = (device: DeviceRow) =>
  apiFetch<void>(`/api/devices/${device.id}`, { method: 'DELETE' });
