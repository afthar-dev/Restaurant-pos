import { useQueryClient, type QueryClient } from '@tanstack/react-query';

/** Everything that shows an order: the order itself, the floor and the active order list. */
export async function refreshOrder(client: QueryClient, orderId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['order', orderId] }),
    client.invalidateQueries({ queryKey: ['floor'] }),
    client.invalidateQueries({ queryKey: ['orders', 'active'] }),
  ]);
}

export function useRefreshOrder() {
  const client = useQueryClient();
  return (orderId: string) => refreshOrder(client, orderId);
}
