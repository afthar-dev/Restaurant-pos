import { useQuery } from '@tanstack/react-query';
import { fetchDevices } from './api';
import { deviceKeys } from './keys';

export function useDevices(enabled = true) {
  return useQuery({ queryKey: deviceKeys.list, queryFn: fetchDevices, enabled });
}
