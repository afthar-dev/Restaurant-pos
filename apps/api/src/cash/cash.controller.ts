import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { cashMovementSchema, type CashMovementRequest } from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser, type RequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { CashService } from './cash.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whoever takes payments at the counter can record cash in and out; the service gates the rest. */
@Controller('cash-movements')
@RequirePermissions('payment.take')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Req() req: RequestContext,
    @Body(new ZodBody(cashMovementSchema)) body: CashMovementRequest,
  ) {
    return this.cash.add(user, req.permissions ?? [], body);
  }

  /** `?businessDayId=` a day, else the latest one. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('businessDayId') businessDayId?: string) {
    return this.cash.list(
      user.outletId,
      businessDayId && UUID.test(businessDayId) ? businessDayId : undefined,
    );
  }
}
