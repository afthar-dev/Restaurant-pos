import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { areaSchema, tableSchema, type AreaRequest, type TableRequest } from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { FloorService } from './floor.service';

@Controller()
export class FloorController {
  constructor(private readonly floor: FloorService) {}

  @Get('floor')
  get(@CurrentUser() user: AuthUser) {
    return this.floor.floor(user.outletId);
  }

  @Post('areas')
  @RequirePermissions('settings.manage')
  createArea(@CurrentUser() user: AuthUser, @Body(new ZodBody(areaSchema)) body: AreaRequest) {
    return this.floor.createArea(user, body);
  }

  @Put('areas/:id')
  @RequirePermissions('settings.manage')
  updateArea(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(areaSchema)) body: AreaRequest,
  ) {
    return this.floor.updateArea(user, id, body);
  }

  @Post('areas/:id/archive')
  @RequirePermissions('settings.manage')
  archiveArea(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.floor.archiveArea(user, id);
  }

  @Get('tables/:id')
  @RequirePermissions('settings.manage')
  getTable(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.floor.getTable(user.outletId, id);
  }

  @Post('tables')
  @RequirePermissions('settings.manage')
  createTable(@CurrentUser() user: AuthUser, @Body(new ZodBody(tableSchema)) body: TableRequest) {
    return this.floor.createTable(user, body);
  }

  @Put('tables/:id')
  @RequirePermissions('settings.manage')
  updateTable(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(tableSchema)) body: TableRequest,
  ) {
    return this.floor.updateTable(user, id, body);
  }

  @Post('tables/:id/archive')
  @RequirePermissions('settings.manage')
  archiveTable(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.floor.archiveTable(user, id);
  }
}
