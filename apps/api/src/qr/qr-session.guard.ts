import {
  createParamDecorator,
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { sha256 } from '../common/crypto';
import type { QrContext, RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

export const QR_SESSION_HEADER = 'x-qr-session';

export const qrSessionEnded = () =>
  new ApiError(HttpStatus.UNAUTHORIZED, 'QR_SESSION_ENDED', 'Scan the table QR again.');

/** Customer routes: the phone must hold a live session from scanning a table's QR sticker. */
@Injectable()
export class QrSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestContext>();
    const token = req.headers[QR_SESSION_HEADER];
    if (typeof token !== 'string' || token.length === 0) throw qrSessionEnded();
    const session = await this.prisma.qrSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { table: { select: { archivedAt: true } } },
    });
    if (
      !session ||
      session.endedAt ||
      session.expiresAt <= new Date() ||
      session.table.archivedAt
    ) {
      throw qrSessionEnded();
    }
    req.qr = { sessionId: session.id, outletId: session.outletId, tableId: session.tableId };
    return true;
  }
}

export const CurrentQr = createParamDecorator((_: unknown, ctx: ExecutionContext): QrContext => {
  const req = ctx.switchToHttp().getRequest<RequestContext>();
  if (!req.qr) throw new Error('CurrentQr used on a route without QrSessionGuard');
  return req.qr;
});
