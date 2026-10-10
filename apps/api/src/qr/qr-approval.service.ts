import { HttpStatus, Injectable } from '@nestjs/common';
import type { OrderLineRequest, QrApproveRequest, QrRejectRequest } from '@rpos/shared';
import { ApiError } from '../common/api-error';
import { notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { KotsService } from '../kots/kots.service';
import { OrdersService, orderNotOpen } from '../orders/orders.service';
import { ACTIVE_STATUSES } from '../orders/table-holder';
import type { OrderView } from '../orders/orders.views';
import { PrismaService } from '../prisma/prisma.service';
import { pendingView, type QrLine, type QrPendingView } from './qr.views';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

const NOTE_MAX = 140;

/**
 * The customer's note for the whole order ("peanut allergy") rides on the first dish's note so
 * it is printed on the KOT; a dish note of its own is kept in front of it.
 */
function withCustomerNote(lines: OrderLineRequest[], note: string | null): OrderLineRequest[] {
  if (!note || lines.length === 0) return lines;
  const [first, ...rest] = lines;
  const combined = [first!.note, note].filter(Boolean).join(' · ').slice(0, NOTE_MAX);
  return [{ ...first!, note: combined }, ...rest];
}

/** Staff side of QR ordering (spec §5.3 step 4): approve (optionally edited) or reject. */
@Injectable()
export class QrApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly kots: KotsService,
  ) {}

  /** Requests waiting for staff, oldest first. */
  async pending(outletId: string): Promise<QrPendingView[]> {
    const submissions = await this.prisma.qrSubmission.findMany({
      where: { outletId, status: 'PENDING', order: { status: { in: [...ACTIVE_STATUSES] } } },
      orderBy: { createdAt: 'asc' },
      include: { table: { select: { name: true } }, order: { select: { status: true } } },
    });
    return submissions.map((s) => pendingView(s, s.order.status));
  }

  /**
   * Puts the requested (or staff-edited) dishes on the order and sends them to the kitchen.
   * Everything before the KOT is one transaction: if a dish ran out, nothing changes and the
   * request stays waiting so staff can edit it.
   */
  async approve(
    approver: AuthUser,
    submissionId: string,
    request: QrApproveRequest,
  ): Promise<OrderView> {
    const orderId = await this.orderOf(approver.outletId, submissionId);
    await this.orders.mutate(approver, orderId, undefined, async ({ tx, order }) => {
      await tx.$queryRaw`SELECT id FROM qr_submissions WHERE id = ${submissionId}::uuid FOR UPDATE`;
      const current = await tx.qrSubmission.findUniqueOrThrow({ where: { id: submissionId } });
      // Approved already (a double tap, or a retry after the kitchen ticket failed): only the
      // ticket below is repeated, with the same key, so the kitchen gets it exactly once.
      if (current.status === 'APPROVED') return;
      const submission = await this.lockPending(tx, submissionId);
      if (order.status === 'PENDING_APPROVAL') {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'OPEN', waiterId: approver.id },
        });
      } else if (order.status === 'BILLED') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'BILL_PRINTED',
          'The bill is already printed. Reject this request, or void the bill first to add these dishes.',
        );
      } else if (order.status !== 'OPEN') {
        throw orderNotOpen();
      }
      const lines =
        request.lines ??
        (submission.lines as unknown as QrLine[]).map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          addonIds: l.addonIds,
          ...(l.note ? { note: l.note } : {}),
        }));
      await this.orders.addLines(tx, order, withCustomerNote(lines, submission.note), approver.id);
      await tx.qrSubmission.update({
        where: { id: submissionId },
        data: { status: 'APPROVED', decidedById: approver.id, decidedAt: new Date() },
      });
    });
    // Same key on a retry: the kitchen gets one ticket for this request.
    const sent = await this.kots.send(approver, orderId, undefined, `qr-${submissionId}`);
    return sent.order;
  }

  /** Turns a request down; an empty table that only had this request is freed again. */
  async reject(
    actor: AuthUser,
    submissionId: string,
    request: QrRejectRequest,
  ): Promise<OrderView> {
    const orderId = await this.orderOf(actor.outletId, submissionId);
    return this.orders.mutate(actor, orderId, undefined, async ({ tx, order }) => {
      await this.lockPending(tx, submissionId);
      await tx.qrSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'REJECTED',
          rejectReason: request.reason || null,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      const others = await tx.qrSubmission.count({ where: { orderId, status: 'PENDING' } });
      if (order.status === 'PENDING_APPROVAL' && others === 0) {
        // The guests may still be seated and can order again, so their QR sessions stay.
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            cancelReason: 'QR order not accepted',
            cancelledById: actor.id,
            closedAt: new Date(),
          },
        });
      }
    });
  }

  private async orderOf(outletId: string, submissionId: string): Promise<string> {
    const submission = await this.prisma.qrSubmission.findFirst({
      where: { id: submissionId, outletId },
      select: { orderId: true },
    });
    if (!submission) throw notFound('QR order');
    return submission.orderId;
  }

  /** Locks the request; only a waiting one can be decided (a second tap gets 409). */
  private async lockPending(tx: Tx, submissionId: string) {
    await tx.$queryRaw`SELECT id FROM qr_submissions WHERE id = ${submissionId}::uuid FOR UPDATE`;
    const submission = await tx.qrSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    if (submission.status !== 'PENDING') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'QR_ALREADY_DECIDED',
        'Someone already decided on this order.',
      );
    }
    return submission;
  }
}
