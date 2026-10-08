import { useQuery } from '@tanstack/react-query';
import { fetchStaff } from './api';
import { staffKeys } from './keys';

export function useStaff(enabled = true) {
  return useQuery({ queryKey: staffKeys.list, queryFn: fetchStaff, enabled });
}
