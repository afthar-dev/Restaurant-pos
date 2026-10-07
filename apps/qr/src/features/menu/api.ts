import { qrFetch } from '@/shared/api/http';
import type { Menu } from './types';

export const fetchMenu = (token: string) => qrFetch<Menu>('/api/qr/menu', { token });
