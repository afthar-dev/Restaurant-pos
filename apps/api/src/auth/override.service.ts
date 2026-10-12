import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasPermission, type Permission } from '@rpos/shared';
import { ApiError } from '../common/api-error';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

/**
 * Manager PIN overrides (spec §6.1). A token from POST /auth/override approves one action for
 * one requester; using it consumes it. Used by PermissionsGuard for route permissions and by
 * services whose limit depends on the request (the cashier discount cap).
 */
@Injectable()
export class OverrideService {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  /** The approving manager, or null when the token is invalid, used or for something else. */
  async approve(
    token: string,
    permission: Permission,
    requester: AuthUser,
  ): Promise<AuthUser | null> {
    const claims = this.tokens.verifyOverride(token);
    if (
      !claims ||
      claims.perm !== permission ||
      claims.oid !== requester.outletId ||
      claims.req !== requester.id
    ) {
      return null;
    }
    const approver = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      include: { outlet: true },
    });
    if (!approver || approver.archivedAt) return null;
    if (!hasPermission(approver.role, permission, approver.outlet)) return null;
    if (!(await this.consume(claims.jti))) return null;
    return {
      id: approver.id,
      name: approver.name,
      role: approver.role,
      outletId: approver.outletId,
    };
  }

  /**
   * For a limit that depends on the request (cash pay-outs, large cash expenses): nothing is
   * needed when `permissions` already holds `permission`; otherwise a manager's token for it.
   * Returns the approving manager, or null when no approval was needed. Throws
   * APPROVAL_REQUIRED (403) when the token is missing, used or not valid for this requester.
   */
  async requireApproval(
    requester: AuthUser,
    permissions: readonly Permission[],
    permission: Permission,
    token: string | undefined,
    message: string,
  ): Promise<AuthUser | null> {
    if (permissions.includes(permission)) return null;
    const manager = token ? await this.approve(token, permission, requester) : null;
    if (!manager) throw new ApiError(HttpStatus.FORBIDDEN, 'APPROVAL_REQUIRED', message);
    return manager;
  }

  /** Marks an override token as used. False when it was used before. */
  private async consume(jti: string): Promise<boolean> {
    try {
      await this.prisma.usedOverrideToken.create({ data: { jti } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}
