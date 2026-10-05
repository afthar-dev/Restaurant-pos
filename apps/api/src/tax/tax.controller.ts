import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { taxRateSchema, type TaxRateRequest } from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { TaxService } from './tax.service';

@Controller('tax-rates')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('include') include?: string) {
    return this.tax.list(user.outletId, include);
  }

  @Post()
  @RequirePermissions('settings.manage')
  create(@CurrentUser() user: AuthUser, @Body(new ZodBody(taxRateSchema)) body: TaxRateRequest) {
    return this.tax.create(user, body);
  }

  @Put(':id')
  @RequirePermissions('settings.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(taxRateSchema)) body: TaxRateRequest,
  ) {
    return this.tax.update(user, id, body);
  }

  @Post(':id/archive')
  @RequirePermissions('settings.manage')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tax.archive(user, id);
  }
}
