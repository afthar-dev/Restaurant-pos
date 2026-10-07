import { useQuery } from '@tanstack/react-query';
import { POLL_MS } from '@/shared/api/queryClient';
import { fetchKdsStations, fetchKdsTickets } from './api';
import { kitchenKeys } from './keys';

export function useKdsStations() {
  return useQuery({
    queryKey: kitchenKeys.stations,
    queryFn: fetchKdsStations,
    staleTime: 5 * 60_000,
  });
}

export function useKdsTickets() {
  return useQuery({
    queryKey: kitchenKeys.all,
    queryFn: fetchKdsTickets,
    refetchInterval: POLL_MS,
  });
}
