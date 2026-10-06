import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  qrApproveSchema,
  qrRejectSchema,
  type QrApproveRequest,
  type QrRejectRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { QrApprovalService } from './qr-approval.service';

/** Staff deciding on QR orders (POS and captain app). */
@Controller('qr')
@RequirePermissions('order.approveQr')
export class QrStaffController {
  constructor(private readonly approvals: QrApprovalService) {}

  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.approvals.pending(user.outletId);
  }

  @Post('submissions/:id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(qrApproveSchema)) body: QrApproveRequest,
  ) {
    return this.approvals.approve(user, id, body);
  }

  @Post('submissions/:id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(qrRejectSchema)) body: QrRejectRequest,
  ) {
    return this.approvals.reject(user, id, body);
  }
}
