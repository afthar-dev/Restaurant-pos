import type { KotStatus } from '@rpos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setKotStatus } from './api';
import { kitchenKeys } from './keys';

/** Moves a ticket on (preparing → ready …). The board reloads either way. */
export function useAdvanceKot() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: KotStatus }) => setKotStatus(id, status),
    onSettled: () => client.invalidateQueries({ queryKey: kitchenKeys.all }),
  });
}
