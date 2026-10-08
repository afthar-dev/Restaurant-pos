import { useQuery } from '@tanstack/react-query';
import { fetchAddonGroups, fetchMenu } from './api';
import { menuKeys } from './keys';

export function useMenu(enabled = true) {
  return useQuery({ queryKey: menuKeys.all, queryFn: fetchMenu, enabled });
}

export function useAddonGroups() {
  return useQuery({ queryKey: menuKeys.addonGroups, queryFn: fetchAddonGroups });
}
