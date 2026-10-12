import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { reasonOf } from '../common/reason';
import {
  addPaymentSchema,
  billCustomerSchema,
  billDiscountSchema,
  changePaymentModeSchema,
  createBillSchema,
  voidBillSchema,
  type AddPaymentRequest,
  type BillCustomerRequest,
  type BillDiscountRequest,
  type ChangePaymentModeRequest,
  type VoidBillRequest,
  type CreateBillRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { OVERRIDE_HEADER } from '../auth/permissions.guard';
import {
  CurrentActor,
  CurrentUser,
  type AuthUser,
  type RequestContext,
} from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { BillsService } from './bills.service';
import { PaymentsService } from './payments.service';

@Controller()
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly payments: PaymentsService,
  ) {}

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

  @Patch('bills/:id/customer')
  @RequirePermissions('bill.print')
  customer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(billCustomerSchema)) body: BillCustomerRequest,
  ) {
    return this.bills.setCustomer(user, id, body);
  }

  @Post('bills/:id/payments')
  @RequirePermissions('payment.take')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodBody(addPaymentSchema)) body: AddPaymentRequest,
  ) {
    return this.payments.add(user, id, idempotencyKey?.slice(0, 100) || undefined, body);
  }

  /** Fixes a wrong mode on a payment of the open day; a manager is needed unless the caller can close the day. */
  @Post('payments/:id/change-mode')
  @RequirePermissions('payment.take')
  changeMode(
    @CurrentUser() user: AuthUser,
    @Req() req: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(changePaymentModeSchema)) body: ChangePaymentModeRequest,
  ) {
    return this.payments.changeMode(user, req.permissions ?? [], id, body);
  }

  @Post('bills/:id/void')
  @RequirePermissions('bill.void')
  void(
    @CurrentActor() actor: AuthUser,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(voidBillSchema)) body: VoidBillRequest,
  ) {
    return this.bills.void(actor, user, id, reasonOf('void', body));
  }

  @Post('bills/:id/print')
  @RequirePermissions('bill.print')
  reprint(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.reprint(user, id);
  }

  @Get('bills/:id/print-payload')
  @RequirePermissions('bill.print')
  printPayload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('paperWidthMm') paperWidthMm?: string,
  ) {
    return this.bills.printPayload(user, id, paperWidthMm === '58' ? 58 : 80);
  }
}
