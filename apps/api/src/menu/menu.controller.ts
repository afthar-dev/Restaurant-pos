import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  addonGroupSchema,
  availabilitySchema,
  bulkPriceSchema,
  categorySchema,
  itemSchema,
  reorderSchema,
  type AddonGroupRequest,
  type BulkPriceRequest,
  type CategoryRequest,
  type ItemRequest,
  type ReorderRequest,
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

  @Put('categories/order')
  @RequirePermissions('menu.manage')
  reorderCategories(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(reorderSchema)) body: ReorderRequest,
  ) {
    return this.menu.reorderCategories(user, body.ids);
  }

  @Put('categories/:id/items/order')
  @RequirePermissions('menu.manage')
  reorderItems(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(reorderSchema)) body: ReorderRequest,
  ) {
    return this.menu.reorderItems(user, id, body.ids);
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

  @Post('prices')
  @RequirePermissions('menu.manage')
  bulkPrices(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(bulkPriceSchema)) body: BulkPriceRequest,
  ) {
    return this.menu.bulkPrices(user, body);
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

  @Put('items/:id/image')
  @RequirePermissions('menu.manage')
  // 5 MB here (nginx's cap); the service turns anything over 1 MB into a friendly 413.
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  setItemImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.menu.setItemImage(user, id, file?.buffer);
  }

  @Delete('items/:id/image')
  @RequirePermissions('menu.manage')
  removeItemImage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.removeItemImage(user, id);
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
