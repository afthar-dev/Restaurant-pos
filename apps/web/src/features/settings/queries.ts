import { useQuery } from '@tanstack/react-query';
import { fetchOutlet } from './api';
import { settingsKeys } from './keys';

/** The restaurant's details: name and GST for bills, rules for cashiers and parcels. */
export function useOutlet(enabled = true) {
  return useQuery({ queryKey: settingsKeys.outlet, queryFn: fetchOutlet, enabled });
}
