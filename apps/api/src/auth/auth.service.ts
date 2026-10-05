import { HttpStatus, Injectable } from '@nestjs/common';
import type { Outlet, User } from '@prisma/client';
import {
  PASSWORD_ROLES,
  permissionsFor,
  type LoginRequest,
  type Permission,
  type Role,
} from '@rpos/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { LockoutService } from './lockout.service';
import { PasswordService } from './password.service';
import { PASSWORD_SESSION_TTL_MS, SessionService, type IssuedSession } from './session.service';
import { TokenService } from './token.service';

export interface SessionBody {
  accessToken: string;
  user: { id: string; name: string; role: Role };
  permissions: Permission[];
}

export interface SessionResult {
  body: SessionBody;
  refresh: IssuedSession;
}

const invalidCredentials = () =>
  new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Wrong phone number or password.');

export const sessionExpired = () =>
  new ApiError(
    HttpStatus.UNAUTHORIZED,
    'SESSION_EXPIRED',
    'Your session has ended. Sign in again.',
  );

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
  ) {}

  async login(request: LoginRequest): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { phone: request.phone },
      include: { outlet: true },
    });
    const eligible =
      user && !user.archivedAt && user.passwordHash && PASSWORD_ROLES.includes(user.role);
    if (!eligible) {
      await this.passwords.verify(null, request.password);
      throw invalidCredentials();
    }
    this.lockout.assertNotLocked(user);
    if (!(await this.passwords.verify(user.passwordHash, request.password))) {
      await this.lockout.recordFailure(user.id);
      throw invalidCredentials();
    }
    await this.lockout.recordSuccess(user.id);
    const refresh = await this.sessions.create(user.id, PASSWORD_SESSION_TTL_MS);
    return { body: this.sessionBody(user, user.outlet), refresh };
  }

  async refresh(token: string | undefined): Promise<SessionResult> {
    if (!token) throw sessionExpired();
    const rotated = await this.sessions.rotate(token);
    if (!rotated) throw sessionExpired();

    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: { outlet: true },
    });
    const device = rotated.deviceId
      ? await this.prisma.device.findUnique({ where: { id: rotated.deviceId } })
      : null;
    if (!user || user.archivedAt || (rotated.deviceId && (!device || device.revokedAt))) {
      await this.sessions.revokeByToken(rotated.token);
      throw sessionExpired();
    }
    return {
      body: this.sessionBody(user, user.outlet),
      refresh: { token: rotated.token, expiresAt: rotated.expiresAt },
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.revokeByToken(token);
  }

  sessionBody(user: User, outlet: Outlet): SessionBody {
    return {
      accessToken: this.tokens.signAccess(user),
      user: { id: user.id, name: user.name, role: user.role },
      permissions: permissionsFor(user.role, outlet),
    };
  }
}
