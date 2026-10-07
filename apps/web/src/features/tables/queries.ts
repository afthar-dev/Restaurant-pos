import { useQuery } from '@tanstack/react-query';
import { fetchLayout, fetchTableCodes } from './api';
import { tableKeys } from './keys';

export function useFloorLayout() {
  return useQuery({ queryKey: tableKeys.layout, queryFn: fetchLayout });
}

export function useTableCodes() {
  return useQuery({ queryKey: tableKeys.qrCodes, queryFn: fetchTableCodes });
}
