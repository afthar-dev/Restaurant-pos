import type { DeviceType } from '@rpos/shared';

export interface DeviceRow {
  id: string;
  name: string;
  type: DeviceType;
  createdBy: { id: string; name: string };
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export const DEVICE_LABEL: Record<DeviceType, string> = {
  POS: 'Counter (POS)',
  CAPTAIN: 'Waiter phone',
  KDS: 'Kitchen screen',
  PRINT_AGENT: 'Print agent',
};
