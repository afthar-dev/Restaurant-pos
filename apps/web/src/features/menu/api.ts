import { apiFetch } from '@/shared/api/http';
import type { Menu } from './types';

export const fetchMenu = () => apiFetch<Menu>('/api/menu');
