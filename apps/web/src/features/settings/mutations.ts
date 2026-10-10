import { useMutation, useQueryClient } from '@tanstack/react-query';
import { removeLogo, updateOutlet, uploadLogo } from './api';
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

/** Uploads (an already shrunk) logo, or removes it with `null`; the cache takes the answer. */
export function useLogo(onDone: (settings: OutletSettings) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (image: Blob | null) => (image ? uploadLogo(image) : removeLogo()),
    onSuccess: (updated) => {
      client.setQueryData(settingsKeys.outlet, updated);
      onDone(updated);
    },
  });
}
