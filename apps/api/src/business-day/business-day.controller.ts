import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  checkCountSchema,
  closeDaySchema,
  openDaySchema,
  reopenDaySchema,
  type CheckCountRequest,
  type CloseDayRequest,
  type OpenDayRequest,
  type ReopenDayRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { BusinessDayService } from './business-day.service';
import { DayCloseService } from './day-close.service';

@Controller('business-day')
export class BusinessDayController {
  constructor(
    private readonly days: BusinessDayService,
    private readonly closing: DayCloseService,
  ) {}

  @Get()
  @RequirePermissions('reports.dayClose')
  list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const n = Number(limit ?? 30);
    return this.closing.list(
      user.outletId,
      Number.isInteger(n) ? Math.min(Math.max(n, 1), 90) : 30,
    );
  }

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.days.current(user.outletId);
  }

  @Post('open')
  @RequirePermissions('day.openClose')
  open(@CurrentUser() user: AuthUser, @Body(new ZodBody(openDaySchema)) body: OpenDayRequest) {
    return this.days.open(user, body.openingCash);
  }

  @Get('close-check')
  @RequirePermissions('day.openClose')
  closeCheck(@CurrentUser() user: AuthUser, @Query('blind') blind?: string) {
    return this.closing.closeCheck(user.outletId, blind === '1');
  }

  /** A manager has counted: shows expected and variance without closing. */
  @Post(':id/close/check-count')
  @RequirePermissions('day.openClose')
  checkCount(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body(new ZodBody(checkCountSchema)) body: CheckCountRequest,
  ) {
    return this.closing.checkCount(user.outletId, body.countedCash);
  }

  @Post('close')
  @RequirePermissions('day.openClose')
  close(@CurrentUser() user: AuthUser, @Body(new ZodBody(closeDaySchema)) body: CloseDayRequest) {
    return this.closing.close(user, body);
  }

  @Get(':id/report')
  @RequirePermissions('reports.dayClose')
  report(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.closing.report(user.outletId, id);
  }

  @Post(':id/reopen')
  @RequirePermissions('day.reopen')
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(reopenDaySchema)) body: ReopenDayRequest,
  ) {
    return this.closing.reopen(user, id, body.reason);
  }
}
