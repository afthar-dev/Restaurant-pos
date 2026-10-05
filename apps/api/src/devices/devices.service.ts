import { HttpStatus, Injectable } from '@nestjs/common';
import type { RegisterDeviceRequest } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { randomToken, sha256 } from '../common/crypto';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async register(actor: AuthUser, request: RegisterDeviceRequest) {
    const token = randomToken();
    const device = await this.prisma.device.create({
      data: {
        outletId: actor.outletId,
        name: request.name,
        type: request.type,
        tokenHash: sha256(token),
        createdById: actor.id,
      },
    });
    await this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action: 'device.register',
      entity: 'device',
      entityId: device.id,
      after: { name: device.name, type: device.type },
    });
    return { token, device: { id: device.id, name: device.name, type: device.type } };
  }

  async list(outletId: string) {
    const devices = await this.prisma.device.findMany({
      where: { outletId },
      orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      revokedAt: d.revokedAt,
    }));
  }

  async revoke(actor: AuthUser, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, outletId: actor.outletId },
    });
    if (!device) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Device not found.');
    if (device.revokedAt) return;
    await this.prisma.device.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    await this.sessions.revokeAllForDevice(device.id);
    await this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action: 'device.revoke',
      entity: 'device',
      entityId: device.id,
      before: { name: device.name, type: device.type },
    });
  }
}
