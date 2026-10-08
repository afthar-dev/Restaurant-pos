import { useQuery } from '@tanstack/react-query';
import { fetchPrinters, fetchStations } from './api';
import { kitchenSetupKeys } from './keys';

export function useStations() {
  return useQuery({ queryKey: kitchenSetupKeys.stations, queryFn: fetchStations });
}

export function usePrinters(enabled = true) {
  return useQuery({ queryKey: kitchenSetupKeys.printers, queryFn: fetchPrinters, enabled });
}
