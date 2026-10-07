import type { Role } from '@rpos/shared';

export interface Staff {
  id: string;
  name: string;
  phone: string;
  role: Role;
  hasPassword: boolean;
  hasPin: boolean;
  archivedAt: string | null;
  lockedUntil: string | null;
}
