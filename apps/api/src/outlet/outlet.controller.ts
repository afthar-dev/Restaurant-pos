import { Body, Controller, Get, Patch } from '@nestjs/common';
import { outletSettingsSchema, type OutletSettingsUpdate } from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { OutletService } from './outlet.service';

@Controller('outlet')
export class OutletController {
  constructor(private readonly outlet: OutletService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.outlet.get(user.outletId);
  }

  @Patch()
  @RequirePermissions('settings.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(outletSettingsSchema)) body: OutletSettingsUpdate,
  ) {
    return this.outlet.update(user, body);
  }
}
