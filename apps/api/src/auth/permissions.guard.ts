import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@rpos/shared';
import { ApiError } from '../common/api-error';
import type { RequestContext } from '../common/request-context';
import { REQUIRED_PERMISSIONS } from './decorators';
import { OverrideService } from './override.service';

export const OVERRIDE_HEADER = 'x-override-token';

/**
 * Global guard that runs after AccessGuard. Checks @RequirePermissions(). When the signed-in
 * user lacks exactly one required permission, a manager override token for that permission
 * (header x-override-token) is accepted and the approving manager becomes `req.actor`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly overrides: OverrideService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<RequestContext>();
    if (!req.user) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Sign in to continue.');
    }
    const missing = required.filter((p) => !req.permissions?.includes(p));
    if (missing.length === 0) {
      req.actor = req.user;
      return true;
    }

    const overrideToken = req.headers[OVERRIDE_HEADER];
    if (missing.length === 1 && typeof overrideToken === 'string') {
      const approver = await this.overrides.approve(overrideToken, missing[0]!, req.user);
      if (approver) {
        req.actor = approver;
        return true;
      }
    }
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      'FORBIDDEN',
      'You do not have permission to do this.',
      {
        permission: missing[0],
      },
    );
  }
}
