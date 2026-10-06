import { Controller, Get } from '@nestjs/common';
import type { Order, OrderItem } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { FloorService } from '../floor/floor.service';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_STATUSES } from './orders.service';
import { orderSubtotal } from './orders.views';

const tableOrder = (order: Order & { items: OrderItem[] }, mergedInto?: string) => ({
  orderId: order.id,
  status: order.status,
  guests: order.guests,
  itemCount: order.items
    .filter((i) => i.status !== 'CANCELLED')
    .reduce((n, i) => n + i.quantity, 0),
  subtotal: orderSubtotal(order.items),
  openedAt: order.createdAt,
  ...(mergedInto ? { mergedInto } : {}),
});

/** The floor plan with each table's running order, for POS and captain screens. */
@Controller('floor')
export class FloorStatusController {
  constructor(
    private readonly floor: FloorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const active = { in: [...ACTIVE_STATUSES] };
    const [areas, orders, merges] = await Promise.all([
      this.floor.floor(user.outletId),
      this.prisma.order.findMany({
        where: { outletId: user.outletId, tableId: { not: null }, status: active },
        include: { items: true },
      }),
      // Tables merged into a running order stay taken by it.
      this.prisma.order.findMany({
        where: { outletId: user.outletId, tableId: { not: null }, mergedInto: { status: active } },
        include: { mergedInto: { include: { items: true, table: true } } },
      }),
    ]);
    const byTable = new Map(orders.map((o) => [o.tableId!, tableOrder(o)]));
    for (const m of merges) {
      if (!byTable.has(m.tableId!) && m.mergedInto) {
        byTable.set(m.tableId!, tableOrder(m.mergedInto, m.mergedInto.table?.name ?? ''));
      }
    }
    return areas.map((area) => ({
      ...area,
      tables: area.tables.map((table) => ({ ...table, order: byTable.get(table.id) ?? null })),
    }));
  }
}
