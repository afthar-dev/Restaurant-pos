import { Body, Controller, Get, Post } from '@nestjs/common';
import { openDaySchema, type OpenDayRequest } from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { BusinessDayService } from './business-day.service';

@Controller('business-day')
export class BusinessDayController {
  constructor(private readonly days: BusinessDayService) {}

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.days.current(user.outletId);
  }

  @Post('open')
  @RequirePermissions('day.openClose')
  open(@CurrentUser() user: AuthUser, @Body(new ZodBody(openDaySchema)) body: OpenDayRequest) {
    return this.days.open(user, body.openingCash);
  }
}
