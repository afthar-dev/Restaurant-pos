import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionsFor } from '@rpos/shared';
import { ApiError } from '../common/api-error';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC } from './decorators';
import { TokenService } from './token.service';

/**
 * Global guard: every route needs a valid Bearer access token unless marked @Public().
 * The user is re-read on each request so archiving someone cuts access immediately.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestContext>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = token ? this.tokens.verifyAccess(token) : null;
    if (!claims) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Sign in to continue.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.userId },
      include: { outlet: true },
    });
    if (!user || user.archivedAt) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'USER_INACTIVE',
        'This account is no longer active.',
      );
    }

    req.user = { id: user.id, name: user.name, role: user.role, outletId: user.outletId };
    req.permissions = permissionsFor(user.role, user.outlet);
    return true;
  }
}
