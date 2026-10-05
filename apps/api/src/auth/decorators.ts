import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@rpos/shared';

export const IS_PUBLIC = 'rpos:isPublic';
export const REQUIRED_PERMISSIONS = 'rpos:requiredPermissions';

/** Skips the access-token check (login, refresh, health, device-cookie routes). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Every listed permission is required. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
