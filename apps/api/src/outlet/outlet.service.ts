import { HttpStatus, Injectable } from '@nestjs/common';
import type { Media, Outlet, Prisma } from '@prisma/client';
import type { OutletSettingsUpdate } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import type { AuthUser } from '../common/request-context';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

type SettingKey = keyof OutletSettingsUpdate;

function toSettings(outlet: Outlet & { logo: Media | null }, urlFor: (key: string) => string) {
  return {
    id: outlet.id,
    logoUrl: outlet.logo ? urlFor(outlet.logo.key) : null,
    name: outlet.name,
    gstin: outlet.gstin,
    taxScheme: outlet.taxScheme,
    address: outlet.address,
    phone: outlet.phone,
    fssaiNumber: outlet.fssaiNumber,
    billHeader: outlet.billHeader,
    billFooter: outlet.billFooter,
    cashierDiscountCapBp: outlet.cashierDiscountCapBp,
    waiterCanCollectPayment: outlet.waiterCanCollectPayment,
    parcelPaymentTiming: outlet.parcelPaymentTiming,
    billPackagingCharge: outlet.billPackagingCharge,
    varianceAlertPaise: outlet.varianceAlertPaise,
    pettyCashLimitPaise: outlet.pettyCashLimitPaise,
    upiVpa: outlet.upiVpa,
    upiPayee: outlet.upiPayee,
    printUpiQr: outlet.printUpiQr,
  };
}

export type OutletSettings = ReturnType<typeof toSettings>;

@Injectable()
export class OutletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  private readonly view = (outlet: Outlet & { logo: Media | null }) =>
    toSettings(outlet, (key) => this.media.urlFor(key));

  private load(outletId: string) {
    return this.prisma.outlet.findUniqueOrThrow({
      where: { id: outletId },
      include: { logo: true },
    });
  }

  async get(outletId: string): Promise<OutletSettings> {
    return this.view(await this.load(outletId));
  }

  /** Sets or replaces the logo (staff header, printed bills, QR menu). */
  async setLogo(actor: AuthUser, bytes: Buffer | undefined): Promise<OutletSettings> {
    const outletId = actor.outletId;
    const media = await this.media.replace({
      outletId,
      bytes,
      current: (tx) => this.lockedLogo(tx, outletId),
      link: (tx, mediaId) =>
        tx.outlet.update({ where: { id: outletId }, data: { logoId: mediaId } }),
    });
    await this.recordLogo(actor, { action: 'set', bytes: media.byteSize });
    return this.get(outletId);
  }

  async removeLogo(actor: AuthUser): Promise<OutletSettings> {
    const outletId = actor.outletId;
    const removed = await this.media.remove({
      current: (tx) => this.lockedLogo(tx, outletId),
      unlink: (tx) => tx.outlet.update({ where: { id: outletId }, data: { logoId: null } }),
    });
    if (removed) await this.recordLogo(actor, { action: 'remove' });
    return this.get(outletId);
  }

  /** Locks the outlet row, then reads its logo, so concurrent logo changes run one at a time. */
  private async lockedLogo(tx: Prisma.TransactionClient, outletId: string) {
    await tx.$queryRaw`SELECT id FROM outlets WHERE id = ${outletId}::uuid FOR UPDATE`;
    const outlet = await tx.outlet.findUniqueOrThrow({
      where: { id: outletId },
      include: { logo: true },
    });
    return outlet.logo;
  }

  private recordLogo(actor: AuthUser, after: Record<string, unknown>) {
    return this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action: 'outlet.logo',
      entity: 'outlet',
      entityId: actor.outletId,
      after: after as never,
    });
  }

  async update(actor: AuthUser, request: OutletSettingsUpdate): Promise<OutletSettings> {
    const current = await this.prisma.outlet.findUniqueOrThrow({ where: { id: actor.outletId } });

    // Only a request that touches the scheme or the GSTIN is checked, so a live outlet that is on
    // REGULAR without a GSTIN can still save its other settings.
    if ('taxScheme' in request || 'gstin' in request) {
      const scheme = request.taxScheme ?? current.taxScheme;
      const gstin = request.gstin === undefined ? current.gstin : request.gstin;
      if (scheme !== 'NONE' && !gstin) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Add your GSTIN to charge GST.');
      }
    }

    const updated = await this.prisma.outlet.update({ where: { id: current.id }, data: request });

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(request) as SettingKey[]) {
      if (current[key] !== updated[key]) {
        before[key] = current[key];
        after[key] = updated[key];
      }
    }
    if (Object.keys(after).length > 0) {
      await this.audit.record({
        outletId: current.id,
        actorId: actor.id,
        action: 'outlet.update',
        entity: 'outlet',
        entityId: current.id,
        before: before as never,
        after: after as never,
      });
    }
    return this.get(updated.id);
  }
}
