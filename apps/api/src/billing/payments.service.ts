import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatPaise, type AddPaymentRequest } from '@rpos/shared';
import { BusinessDayService } from '../business-day/business-day.service';
import { ApiError } from '../common/api-error';
import type { AuthUser } from '../common/request-context';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import type { BillView } from './bill.views';
import { BillsService } from './bills.service';
import { closeOrderIfSettled, settleBill } from './settle';

type Tx = Prisma.TransactionClient;

/** Cash, UPI and card payments (recorded, not processed). Split equally = several payments. */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bills: BillsService,
    private readonly orders: OrdersService,
    private readonly days: BusinessDayService,
  ) {}

  async add(
    actor: AuthUser,
    billId: string,
    idempotencyKey: string | undefined,
    request: AddPaymentRequest,
  ): Promise<BillView> {
    if (
      idempotencyKey &&
      (await this.stored(this.prisma, actor.outletId, billId, idempotencyKey))
    ) {
      return this.bills.get(actor.outletId, billId);
    }
    if (request.tendered !== undefined) {
      if (request.mode !== 'CASH') {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'VALIDATION',
          'Only cash payments have a tendered amount.',
        );
      }
      if (request.tendered < request.amount) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'VALIDATION',
          'The cash handed over is less than the amount.',
        );
      }
    }
    const orderId = await this.bills.orderOf(actor.outletId, billId);
    try {
      await this.orders.mutate(actor, orderId, undefined, async ({ tx }) => {
        // Checked again under the order lock: a concurrent duplicate waits here for the first.
        if (idempotencyKey && (await this.stored(tx, actor.outletId, billId, idempotencyKey))) {
          return;
        }
        const bill = await this.bills.lockBill(tx, actor.outletId, billId, undefined);
        if (bill.status !== 'OPEN') {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'BILL_NOT_OPEN',
            bill.status === 'PAID' ? 'This bill is already paid.' : 'This bill was voided.',
          );
        }
        await this.days.requireOpen(tx, actor.outletId);
        const paid = await tx.payment.aggregate({ where: { billId }, _sum: { amount: true } });
        const due = bill.total - (paid._sum.amount ?? 0);
        if (request.amount > due) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'OVERPAYMENT',
            `Only ${formatPaise(due)} is due on this bill.`,
            { due },
          );
        }
        const cash = request.mode === 'CASH';
        const payment = await tx.payment.create({
          data: {
            outletId: actor.outletId,
            billId,
            businessDayId: bill.businessDayId,
            mode: request.mode,
            amount: request.amount,
            tendered: cash ? (request.tendered ?? null) : null,
            change:
              cash && request.tendered !== undefined ? request.tendered - request.amount : null,
            reference: cash ? null : request.reference || null,
            receivedById: actor.id,
          },
        });
        if (idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              outletId: actor.outletId,
              key: idempotencyKey,
              response: { billId, paymentId: payment.id },
            },
          });
        }
        if (await settleBill(tx, billId)) await closeOrderIfSettled(tx, orderId);
      });
    } catch (error) {
      // The same key at the same moment: answer like a sequential retry.
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (await this.stored(this.prisma, actor.outletId, billId, idempotencyKey))
      ) {
        return this.bills.get(actor.outletId, billId);
      }
      throw error;
    }
    this.bills.changed(actor.outletId, billId, orderId);
    return this.bills.get(actor.outletId, billId);
  }

  /** True when this key already recorded a payment on this bill; a key from another bill is refused. */
  private async stored(
    db: Pick<Tx, 'idempotencyKey'>,
    outletId: string,
    billId: string,
    key: string,
  ): Promise<boolean> {
    const stored = await db.idempotencyKey.findUnique({
      where: { outletId_key: { outletId, key } },
    });
    if (!stored) return false;
    if ((stored.response as { billId?: string }).billId !== billId) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_KEY_REUSED',
        'This request id was already used for something else.',
      );
    }
    return true;
  }
}
