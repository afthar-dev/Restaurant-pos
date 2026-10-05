import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  loginSchema,
  overrideSchema,
  permissionsFor,
  pinLoginSchema,
  type LoginRequest,
  type OverrideRequest,
  type PinLoginRequest,
} from '@rpos/shared';
import type { Response } from 'express';
import { ThrottleAuth } from '../common/throttle';
import { DeviceGuard } from '../devices/device.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type AuthUser, type RequestContext } from '../common/request-context';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type SessionBody, type SessionResult } from './auth.service';
import { REFRESH_COOKIE, refreshCookieOptions } from './cookies';
import { Public } from './decorators';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @ThrottleAuth()
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: RequestContext,
    @Body(new ZodBody(loginSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionBody> {
    return this.respond(await this.auth.login(body, req.ip ?? 'unknown'), res);
  }

  @Public()
  @UseGuards(DeviceGuard)
  @Get('staff')
  staff(@Req() req: RequestContext) {
    return this.auth.staffFor(req.device!);
  }

  @Public()
  @ThrottleAuth()
  @UseGuards(DeviceGuard)
  @Post('pin-login')
  @HttpCode(200)
  async pinLogin(
    @Req() req: RequestContext,
    @Body(new ZodBody(pinLoginSchema)) body: PinLoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionBody> {
    return this.respond(await this.auth.pinLogin(req.device!, body), res);
  }

  @Get('approvers')
  approvers(@CurrentUser() user: AuthUser) {
    return this.auth.approvers(user.outletId);
  }

  @ThrottleAuth()
  @Post('override')
  override(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(overrideSchema)) body: OverrideRequest,
  ) {
    return this.auth.issueOverride(user, body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionBody> {
    try {
      return this.respond(await this.auth.refresh(this.refreshToken(req)), res);
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.env.COOKIE_SECURE));
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.refreshToken(req));
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.env.COOKIE_SECURE));
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const outlet = await this.prisma.outlet.findUniqueOrThrow({ where: { id: user.outletId } });
    return {
      user: { id: user.id, name: user.name, role: user.role },
      permissions: permissionsFor(user.role, outlet),
      outlet: { id: outlet.id, name: outlet.name },
    };
  }

  private refreshToken(req: RequestContext): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private respond(result: SessionResult, res: Response): SessionBody {
    res.cookie(
      REFRESH_COOKIE,
      result.refresh.token,
      refreshCookieOptions(this.env.COOKIE_SECURE, result.refresh.expiresAt),
    );
    return result.body;
  }
}
