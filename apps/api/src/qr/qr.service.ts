import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type QrSubmission } from '@prisma/client';
import type { QrSubmitRequest } from '@rpos/shared';
import { BusinessDayService } from '../business-day/business-day.service';
import { ApiError } from '../common/api-error';
import { randomToken, sha256 } from '../common/crypto';
import type { QrContext } from '../common/request-context';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';
import { ACTIVE_STATUSES, tableHolder } from '../orders/table-holder';
import { PrismaService } from '../prisma/prisma.service';
import { submissionView, type QrLine, type QrSubmissionView } from './qr.views';

/** How long one scan lasts if the table is never vacated (a long lunch, a forgotten phone). */
const SESSION_HOURS = 8;
/** Per phone: at most MAX_PER_SESSION submissions in RATE_WINDOW_MS (spec §5.3 rate limit). */
const MAX_PER_SESSION = 5;
const RATE_WINDOW_MS = 10 * 60_000;
/** Per table: requests waiting for staff before the next one is refused. */
const MAX_PENDING_PER_TABLE = 3;

/**
 * Customers' request ids live in their own namespace, so a phone can never produce a key the
 * staff side uses (an approval sends its KOT with the key "qr-<submissionId>").
 */
const customerKey = (qr: QrContext, key: string) => `qr:${qr.sessionId}:${key}`;

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
    private readonly orders: OrdersService,
    private readonly days: BusinessDayService,
    private readonly events: EventEmitter2,
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

  /**
   * A customer sends dishes for staff to approve. A free table gets an empty PENDING_APPROVAL
   * order that holds it; a seated table's order gets the submission. Nothing reaches the
   * kitchen or the bill until staff approve.
   */
  async submit(
    qr: QrContext,
    idempotencyKey: string | undefined,
    request: QrSubmitRequest,
  ): Promise<QrSubmissionView> {
    if (idempotencyKey) {
      const replay = await this.replay(this.prisma, qr, idempotencyKey);
      if (replay) return replay;
    }
    let result: { replay: QrSubmissionView } | { created: QrSubmission };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        if (idempotencyKey) {
          const replay = await this.replay(tx, qr, idempotencyKey);
          if (replay) return { replay };
        }
        // Lock the table first: it serialises every submit for this table (and so for this
        // phone), so the caps below hold even when requests arrive at once, and two phones
        // on a free table get one order.
        await tx.$queryRaw`SELECT id FROM tables WHERE id = ${qr.tableId}::uuid FOR UPDATE`;
        const recent = await tx.qrSubmission.count({
          where: {
            sessionId: qr.sessionId,
            createdAt: { gt: new Date(Date.now() - RATE_WINDOW_MS) },
          },
        });
        const waiting = await tx.qrSubmission.count({
          where: {
            tableId: qr.tableId,
            status: 'PENDING',
            order: { status: { in: [...ACTIVE_STATUSES] } },
          },
        });
        if (recent >= MAX_PER_SESSION || waiting >= MAX_PENDING_PER_TABLE) {
          throw new ApiError(
            HttpStatus.TOO_MANY_REQUESTS,
            'QR_TOO_MANY',
            'Please wait for the staff to confirm your order.',
          );
        }
        const day = await this.days.requireOpen(tx, qr.outletId).catch(() => {
          throw new ApiError(HttpStatus.CONFLICT, 'DAY_NOT_OPEN', 'Ordering is closed right now.');
        });
        const variants = await this.orders.loadVariants(tx, qr.outletId, request.lines);

        const holder = await this.lockedHolder(tx, qr.tableId);
        let orderId: string;
        if (holder) {
          if (holder.status === 'BILLED') {
            throw new ApiError(
              HttpStatus.CONFLICT,
              'QR_BILL_PRINTED',
              'The bill is already printed. Please call the waiter.',
            );
          }
          orderId = holder.id;
        } else {
          const order = await tx.order.create({
            data: {
              outletId: qr.outletId,
              businessDayId: day.id,
              type: 'DINE_IN',
              source: 'QR',
              status: 'PENDING_APPROVAL',
              tableId: qr.tableId,
            },
          });
          orderId = order.id;
        }

        const lines: QrLine[] = request.lines.map((line) => {
          const variant = variants.get(line.variantId)!;
          const allAddons = variant.item.addonGroups.flatMap((g) => g.group.addons);
          const addons = line.addonIds.map((id) => allAddons.find((a) => a.id === id)!);
          return {
            variantId: line.variantId,
            quantity: line.quantity,
            addonIds: line.addonIds,
            ...(line.note ? { note: line.note } : {}),
            itemName: variant.item.name,
            variantName: variant.name,
            addons: addons.map((a) => a.name),
            unitPrice: variant.dineInPrice + addons.reduce((sum, a) => sum + a.price, 0),
          };
        });
        const submission = await tx.qrSubmission.create({
          data: {
            outletId: qr.outletId,
            tableId: qr.tableId,
            orderId,
            sessionId: qr.sessionId,
            lines: lines as unknown as Prisma.InputJsonValue,
            note: request.note || null,
            total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
          },
        });
        if (idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              outletId: qr.outletId,
              key: customerKey(qr, idempotencyKey),
              response: { sessionId: qr.sessionId, submissionId: submission.id },
            },
          });
        }
        return { created: submission };
      });
    } catch (error) {
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.replay(this.prisma, qr, idempotencyKey);
        if (replay) return replay;
      }
      throw error;
    }
    if ('replay' in result) return result.replay;
    const { created } = result;
    const table = await this.prisma.diningTable.findUniqueOrThrow({ where: { id: qr.tableId } });
    this.events.emit('qr.submitted', {
      outletId: qr.outletId,
      submissionId: created.id,
      orderId: created.orderId,
      tableName: table.name,
    });
    this.events.emit('order.updated', {
      outletId: qr.outletId,
      orderId: created.orderId,
      tableId: qr.tableId,
    });
    return submissionView(created);
  }

  /**
   * The table's current order, locked. Staff may be cancelling, billing or voiding it at this
   * moment: after the lock its status is final for this transaction, and if it stopped being
   * active the table's holder is looked up again.
   */
  private async lockedHolder(tx: Prisma.TransactionClient, tableId: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const holder = await tableHolder(tx, tableId);
      if (!holder) return null;
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${holder.id}::uuid FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({ where: { id: holder.id } });
      if ((ACTIVE_STATUSES as readonly string[]).includes(order.status)) return order;
    }
    return null;
  }

  /** This phone's submissions, newest first. */
  async mySubmissions(qr: QrContext): Promise<QrSubmissionView[]> {
    const submissions = await this.prisma.qrSubmission.findMany({
      where: { sessionId: qr.sessionId },
      orderBy: { createdAt: 'desc' },
    });
    return submissions.map(submissionView);
  }

  /** The submission a retried request already made, or null; a key from another phone is refused. */
  private async replay(
    db: Pick<Prisma.TransactionClient, 'idempotencyKey' | 'qrSubmission'>,
    qr: QrContext,
    key: string,
  ): Promise<QrSubmissionView | null> {
    const stored = await db.idempotencyKey.findUnique({
      where: { outletId_key: { outletId: qr.outletId, key: customerKey(qr, key) } },
    });
    if (!stored) return null;
    const response = stored.response as { sessionId?: string; submissionId?: string };
    if (response.sessionId !== qr.sessionId || !response.submissionId) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_KEY_REUSED',
        'This request id was already used for something else.',
      );
    }
    const submission = await db.qrSubmission.findUniqueOrThrow({
      where: { id: response.submissionId },
    });
    return submissionView(submission);
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
