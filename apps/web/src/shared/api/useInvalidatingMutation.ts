import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

export interface InvalidatingMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Queries that show what this mutation changed. */
  invalidates: readonly QueryKey[];
  /** Clear a field or close a confirm bar; by default it runs before the refresh. */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /**
   * Run `onSuccess` only once the queries have refetched. Edit forms use this: they close
   * when the list already shows the saved values, so reopening never edits stale data.
   */
  afterRefresh?: boolean;
}

/**
 * A mutation that refreshes the queries it affects. The mutation stays pending until they
 * have refetched, so a list never shows stale rows after its form says "saved".
 */
export function useInvalidatingMutation<TData = unknown, TVariables = void>({
  mutationFn,
  invalidates,
  onSuccess,
  afterRefresh = false,
}: InvalidatingMutationOptions<TData, TVariables>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, variables) => {
      if (!afterRefresh) onSuccess?.(data, variables);
      await Promise.all(invalidates.map((queryKey) => client.invalidateQueries({ queryKey })));
      if (afterRefresh) onSuccess?.(data, variables);
    },
  });
}
