import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { qrStartSchema, type QrStartRequest } from '@rpos/shared';
import { Public } from '../auth/decorators';
import type { QrContext } from '../common/request-context';
import { ThrottleAuth } from '../common/throttle';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentQr, QrSessionGuard } from './qr-session.guard';
import { QrService } from './qr.service';

/** Customer side of QR ordering: no staff sign-in, a session from scanning the table sticker. */
@Public()
@Controller('qr')
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Post('sessions')
  @ThrottleAuth()
  start(@Body(new ZodBody(qrStartSchema)) body: QrStartRequest) {
    return this.qr.startSession(body.code);
  }

  @Get('menu')
  @UseGuards(QrSessionGuard)
  menu(@CurrentQr() qr: QrContext) {
    return this.qr.menu(qr);
  }
}
