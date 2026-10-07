import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateOutlet } from './api';
import { settingsKeys } from './keys';
import type { OutletSettings } from './types';

/** Saves changed settings; the server's answer replaces the cached outlet at once. */
export function useUpdateOutlet(onSaved: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (changes: Partial<OutletSettings>) => updateOutlet(changes),
    onSuccess: (updated) => {
      client.setQueryData(settingsKeys.outlet, updated);
      onSaved();
    },
  });
}
