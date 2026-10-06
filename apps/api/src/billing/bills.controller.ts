import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  billDiscountSchema,
  createBillSchema,
  type BillDiscountRequest,
  type CreateBillRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { OVERRIDE_HEADER } from '../auth/permissions.guard';
import { CurrentUser, type AuthUser, type RequestContext } from '../common/request-context';
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

  @Put('bills/:id/discount')
  @RequirePermissions('discount.apply')
  discount(
    @CurrentUser() user: AuthUser,
    @Req() req: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(billDiscountSchema)) body: BillDiscountRequest,
  ) {
    const token = req.headers[OVERRIDE_HEADER];
    return this.bills.setDiscount(
      user,
      req.permissions ?? [],
      id,
      ifMatch,
      typeof token === 'string' ? token : undefined,
      body,
    );
  }
}
