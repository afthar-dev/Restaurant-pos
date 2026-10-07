import { authKeys } from '@/features/auth';
import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import { registerDevice, revokeDevice } from './api';
import { deviceKeys } from './keys';

/** Registers this browser; its own device and the device list both change. */
export function useRegisterDevice(onRegistered: (device: { name: string }) => void) {
  return useInvalidatingMutation({
    mutationFn: registerDevice,
    invalidates: [authKeys.device, deviceKeys.list],
    onSuccess: onRegistered,
  });
}

export function useRevokeDevice(onRevoked: () => void) {
  return useInvalidatingMutation({
    mutationFn: revokeDevice,
    invalidates: [deviceKeys.list],
    onSuccess: onRevoked,
  });
}
