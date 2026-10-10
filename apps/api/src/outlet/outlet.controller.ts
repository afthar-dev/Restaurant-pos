import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Put('logo')
  @RequirePermissions('settings.manage')
  // 5 MB here (nginx's cap); the service turns anything over 1 MB into a friendly 413.
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  setLogo(@CurrentUser() user: AuthUser, @UploadedFile() file: { buffer: Buffer } | undefined) {
    return this.outlet.setLogo(user, file?.buffer);
  }

  @Delete('logo')
  @RequirePermissions('settings.manage')
  removeLogo(@CurrentUser() user: AuthUser) {
    return this.outlet.removeLogo(user);
  }
}
