import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { FloorService } from '../floor/floor.service';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_STATUSES } from './orders.service';
import { orderSubtotal } from './orders.views';

/** The floor plan with each table's running order, for POS and captain screens. */
@Controller('floor')
export class FloorStatusController {
  constructor(
    private readonly floor: FloorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const [areas, orders] = await Promise.all([
      this.floor.floor(user.outletId),
      this.prisma.order.findMany({
        where: {
          outletId: user.outletId,
          tableId: { not: null },
          status: { in: [...ACTIVE_STATUSES] },
        },
        include: { items: true },
      }),
    ]);
    const byTable = new Map(orders.map((o) => [o.tableId!, o]));
    return areas.map((area) => ({
      ...area,
      tables: area.tables.map((table) => {
        const order = byTable.get(table.id);
        return {
          ...table,
          order: order
            ? {
                orderId: order.id,
                status: order.status,
                guests: order.guests,
                itemCount: order.items
                  .filter((i) => i.status !== 'CANCELLED')
                  .reduce((n, i) => n + i.quantity, 0),
                subtotal: orderSubtotal(order.items),
                openedAt: order.createdAt,
              }
            : null,
        };
      }),
    }));
  }
}
