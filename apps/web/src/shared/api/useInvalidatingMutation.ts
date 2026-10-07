import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

export interface InvalidatingMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Queries that show what this mutation changed. */
  invalidates: readonly QueryKey[];
  /** Runs first (close a form, clear a field), then the queries refresh. */
  onSuccess?: (data: TData, variables: TVariables) => void;
}

/**
 * A mutation that refreshes the queries it affects. The mutation stays pending until they
 * have refetched, so a list never shows stale rows after its form says "saved".
 */
export function useInvalidatingMutation<TData = unknown, TVariables = void>({
  mutationFn,
  invalidates,
  onSuccess,
}: InvalidatingMutationOptions<TData, TVariables>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, variables) => {
      onSuccess?.(data, variables);
      await Promise.all(invalidates.map((queryKey) => client.invalidateQueries({ queryKey })));
    },
  });
}
