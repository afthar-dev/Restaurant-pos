import { Injectable } from '@nestjs/common';
import type { Outlet } from '@prisma/client';
import type { OutletSettingsUpdate } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

type SettingKey = keyof OutletSettingsUpdate;

function toSettings(outlet: Outlet) {
  return {
    id: outlet.id,
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
  };
}

export type OutletSettings = ReturnType<typeof toSettings>;

@Injectable()
export class OutletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(outletId: string): Promise<OutletSettings> {
    return toSettings(await this.prisma.outlet.findUniqueOrThrow({ where: { id: outletId } }));
  }

  async update(actor: AuthUser, request: OutletSettingsUpdate): Promise<OutletSettings> {
    const current = await this.prisma.outlet.findUniqueOrThrow({ where: { id: actor.outletId } });
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
    return toSettings(updated);
  }
}
