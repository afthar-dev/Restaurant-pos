import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { DEVICE_COOKIE } from '../auth/cookies';
import { ApiError } from '../common/api-error';
import { sha256 } from '../common/crypto';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

export const deviceNotRegistered = () =>
  new ApiError(
    HttpStatus.UNAUTHORIZED,
    'DEVICE_NOT_REGISTERED',
    'This device is not registered. Ask a manager to register it.',
  );

/** Requires the httpOnly device cookie of a registered, non-revoked device. Sets req.device. */
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestContext>();
    const token: unknown = req.cookies?.[DEVICE_COOKIE];
    if (typeof token !== 'string' || token.length === 0) throw deviceNotRegistered();

    const device = await this.prisma.device.findUnique({ where: { tokenHash: sha256(token) } });
    if (!device || device.revokedAt) throw deviceNotRegistered();

    await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    req.device = { id: device.id, name: device.name, type: device.type, outletId: device.outletId };
    return true;
  }
}
