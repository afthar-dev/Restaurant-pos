import { useQuery } from '@tanstack/react-query';
import { fetchMenu } from './api';
import { menuKeys } from './keys';

export function useMenu() {
  return useQuery({ queryKey: menuKeys.all, queryFn: fetchMenu });
}
