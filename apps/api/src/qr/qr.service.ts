import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { randomToken, sha256 } from '../common/crypto';
import type { QrContext } from '../common/request-context';
import { MenuService } from '../menu/menu.service';
import { PrismaService } from '../prisma/prisma.service';

/** How long one scan lasts if the table is never vacated (a long lunch, a forgotten phone). */
const SESSION_HOURS = 8;

type StaffMenu = Awaited<ReturnType<MenuService['menu']>>;
type StaffItem = StaffMenu['categories'][number]['items'][number];

/** The customer's menu: only what can be ordered now, at dine-in prices. */
function customerItem(item: StaffItem) {
  if (!item.isAvailable) return null;
  const addonGroups = item.addonGroups.map((g) => ({
    id: g.id,
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    addons: g.addons
      .filter((a) => a.isAvailable)
      .map((a) => ({ id: a.id, name: a.name, price: a.price })),
  }));
  // A required choice with nothing left to choose cannot be ordered.
  if (addonGroups.some((g) => g.addons.length < g.minSelect)) return null;
  if (item.variants.length === 0) return null;
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    foodType: item.foodType,
    variants: item.variants.map((v) => ({ id: v.id, name: v.name, price: v.dineInPrice })),
    addonGroups,
  };
}

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenuService,
  ) {}

  /** A phone scanned a table sticker: open a session for that table. */
  async startSession(code: string) {
    const table = await this.prisma.diningTable.findUnique({
      where: { qrToken: code },
      include: { outlet: { select: { name: true } } },
    });
    if (!table || table.archivedAt) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'QR_UNKNOWN',
        'This QR code is not in use. Please call the waiter.',
      );
    }
    const token = randomToken();
    await this.prisma.qrSession.create({
      data: {
        outletId: table.outletId,
        tableId: table.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
      },
    });
    return { token, table: { name: table.name }, outlet: { name: table.outlet.name } };
  }

  async menu(qr: QrContext) {
    const menu = await this.menus.menu(qr.outletId);
    return {
      categories: menu.categories
        .map((c) => ({
          id: c.id,
          name: c.name,
          items: c.items.flatMap((i) => {
            const item = customerItem(i);
            return item ? [item] : [];
          }),
        }))
        .filter((c) => c.items.length > 0),
    };
  }
}
