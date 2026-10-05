import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  printerSchema,
  stationSchema,
  type PrinterRequest,
  type StationRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { KitchenService } from './kitchen.service';

@Controller('stations')
export class StationsController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('include') include?: string) {
    return this.kitchen.listStations(user.outletId, include);
  }

  @Post()
  @RequirePermissions('settings.manage')
  create(@CurrentUser() user: AuthUser, @Body(new ZodBody(stationSchema)) body: StationRequest) {
    return this.kitchen.createStation(user, body);
  }

  @Put(':id')
  @RequirePermissions('settings.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(stationSchema)) body: StationRequest,
  ) {
    return this.kitchen.updateStation(user, id, body);
  }

  @Post(':id/archive')
  @RequirePermissions('settings.manage')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.archiveStation(user, id);
  }
}

@Controller('printers')
export class PrintersController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('include') include?: string) {
    return this.kitchen.listPrinters(user.outletId, include);
  }

  @Post()
  @RequirePermissions('settings.manage')
  create(@CurrentUser() user: AuthUser, @Body(new ZodBody(printerSchema)) body: PrinterRequest) {
    return this.kitchen.createPrinter(user, body);
  }

  @Put(':id')
  @RequirePermissions('settings.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(printerSchema)) body: PrinterRequest,
  ) {
    return this.kitchen.updatePrinter(user, id, body);
  }

  @Post(':id/archive')
  @RequirePermissions('settings.manage')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.archivePrinter(user, id);
  }
}
