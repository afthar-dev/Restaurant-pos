import { useQuery } from '@tanstack/react-query';
import { fetchAddonGroups, fetchMenu } from './api';
import { menuKeys } from './keys';

export function useMenu() {
  return useQuery({ queryKey: menuKeys.all, queryFn: fetchMenu });
}

export function useAddonGroups() {
  return useQuery({ queryKey: menuKeys.addonGroups, queryFn: fetchAddonGroups });
}
