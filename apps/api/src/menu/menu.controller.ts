import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  addonGroupSchema,
  availabilitySchema,
  categorySchema,
  itemSchema,
  type AddonGroupRequest,
  type CategoryRequest,
  type ItemRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.menu.menu(user.outletId);
  }

  @Post('categories')
  @RequirePermissions('menu.manage')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(categorySchema)) body: CategoryRequest,
  ) {
    return this.menu.createCategory(user, body);
  }

  @Put('categories/:id')
  @RequirePermissions('menu.manage')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(categorySchema)) body: CategoryRequest,
  ) {
    return this.menu.updateCategory(user, id, body);
  }

  @Post('categories/:id/archive')
  @RequirePermissions('menu.manage')
  archiveCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.archiveCategory(user, id);
  }

  @Post('items')
  @RequirePermissions('menu.manage')
  createItem(@CurrentUser() user: AuthUser, @Body(new ZodBody(itemSchema)) body: ItemRequest) {
    return this.menu.createItem(user, body);
  }

  @Put('items/:id')
  @RequirePermissions('menu.manage')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(itemSchema)) body: ItemRequest,
  ) {
    return this.menu.updateItem(user, id, body);
  }

  @Post('items/:id/archive')
  @RequirePermissions('menu.manage')
  archiveItem(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.archiveItem(user, id);
  }

  @Patch('items/:id/availability')
  @RequirePermissions('menu.availability')
  itemAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(availabilitySchema)) body: { isAvailable: boolean },
  ) {
    return this.menu.setItemAvailability(user.outletId, id, body.isAvailable);
  }

  @Get('addon-groups')
  addonGroups(@CurrentUser() user: AuthUser) {
    return this.menu.addonGroups(user.outletId);
  }

  @Post('addon-groups')
  @RequirePermissions('menu.manage')
  createAddonGroup(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(addonGroupSchema)) body: AddonGroupRequest,
  ) {
    return this.menu.createAddonGroup(user, body);
  }

  @Put('addon-groups/:id')
  @RequirePermissions('menu.manage')
  updateAddonGroup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(addonGroupSchema)) body: AddonGroupRequest,
  ) {
    return this.menu.updateAddonGroup(user, id, body);
  }

  @Post('addon-groups/:id/archive')
  @RequirePermissions('menu.manage')
  archiveAddonGroup(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.archiveAddonGroup(user, id);
  }

  @Patch('addons/:id/availability')
  @RequirePermissions('menu.availability')
  addonAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(availabilitySchema)) body: { isAvailable: boolean },
  ) {
    return this.menu.setAddonAvailability(user.outletId, id, body.isAvailable);
  }
}
