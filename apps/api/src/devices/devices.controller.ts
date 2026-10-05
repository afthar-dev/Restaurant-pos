import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { registerDeviceSchema, type RegisterDeviceRequest } from '@rpos/shared';
import type { Response } from 'express';
import { DEVICE_COOKIE, deviceCookieOptions } from '../auth/cookies';
import { Public, RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser, type RequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DeviceGuard } from './device.guard';
import { DevicesService } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Registers the browser making this request; it receives the device cookie. */
  @Post()
  @RequirePermissions('devices.manage')
  async register(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(registerDeviceSchema)) body: RegisterDeviceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, device } = await this.devices.register(user, body);
    res.cookie(DEVICE_COOKIE, token, deviceCookieOptions(this.env.COOKIE_SECURE));
    return device;
  }

  @Get()
  @RequirePermissions('devices.manage')
  list(@CurrentUser() user: AuthUser) {
    return this.devices.list(user.outletId);
  }

  @Public()
  @UseGuards(DeviceGuard)
  @Get('current')
  current(@Req() req: RequestContext) {
    const device = req.device!;
    return { id: device.id, name: device.name, type: device.type };
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('devices.manage')
  async revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.devices.revoke(user, id);
  }
}
