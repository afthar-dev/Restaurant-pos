import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import {
  qrStartSchema,
  qrSubmitSchema,
  type QrStartRequest,
  type QrSubmitRequest,
} from '@rpos/shared';
import { Public } from '../auth/decorators';
import type { QrContext } from '../common/request-context';
import { ThrottleQrSession } from '../common/throttle';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentQr, QrSessionGuard } from './qr-session.guard';
import { QrService } from './qr.service';

/** Customer side of QR ordering: no staff sign-in, a session from scanning the table sticker. */
@Public()
@Controller('qr')
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Post('sessions')
  @ThrottleQrSession()
  start(@Body(new ZodBody(qrStartSchema)) body: QrStartRequest) {
    return this.qr.startSession(body.code);
  }

  @Get('menu')
  @UseGuards(QrSessionGuard)
  menu(@CurrentQr() qr: QrContext) {
    return this.qr.menu(qr);
  }

  @Post('orders')
  @UseGuards(QrSessionGuard)
  submit(
    @CurrentQr() qr: QrContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodBody(qrSubmitSchema)) body: QrSubmitRequest,
  ) {
    return this.qr.submit(qr, idempotencyKey?.slice(0, 100) || undefined, body);
  }

  @Get('orders')
  @UseGuards(QrSessionGuard)
  mine(@CurrentQr() qr: QrContext) {
    return this.qr.mySubmissions(qr);
  }
}
