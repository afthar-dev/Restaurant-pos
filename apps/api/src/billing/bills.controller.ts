import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createBillSchema, type CreateBillRequest } from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { BillsService } from './bills.service';

@Controller()
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Post('orders/:id/bills')
  @RequirePermissions('bill.print')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(createBillSchema)) body: CreateBillRequest,
  ) {
    return this.bills.create(user, id, ifMatch, body);
  }

  @Get('orders/:id/bills')
  @RequirePermissions('bill.print')
  forOrder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.forOrder(user.outletId, id);
  }

  @Get('bills/:id')
  @RequirePermissions('bill.print')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.get(user.outletId, id);
  }
}
