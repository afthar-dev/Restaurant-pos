import { useQuery } from '@tanstack/react-query';
import { fetchLayout, fetchTableCodes } from './api';
import { tableKeys } from './keys';

export function useFloorLayout(enabled = true) {
  return useQuery({ queryKey: tableKeys.layout, queryFn: fetchLayout, enabled });
}

export function useTableCodes() {
  return useQuery({ queryKey: tableKeys.qrCodes, queryFn: fetchTableCodes });
}
