import { HttpStatus, Injectable } from '@nestjs/common';
import type { Outlet, User } from '@prisma/client';
import {
  hasPermission,
  PASSWORD_ROLES,
  permissionsFor,
  type LoginRequest,
  type OverrideRequest,
  type Permission,
  type PinLoginRequest,
  type Role,
} from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import type { AuthDevice, AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { LockoutService } from './lockout.service';
import { PasswordService } from './password.service';
import {
  PASSWORD_SESSION_TTL_MS,
  PIN_SESSION_TTL_MS,
  SessionService,
  type IssuedSession,
} from './session.service';
import { OVERRIDE_TOKEN_TTL_SECONDS, TokenService } from './token.service';

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

const wrongPin = () => new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Wrong PIN.');

const overrideDenied = () =>
  new ApiError(
    HttpStatus.FORBIDDEN,
    'OVERRIDE_DENIED',
    'That person cannot approve this, or the PIN is wrong.',
  );

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
    private readonly audit: AuditService,
  ) {}

  /** Staff who can sign in with a PIN on this device. */
  staffFor(device: AuthDevice) {
    return this.prisma.user.findMany({
      where: { outletId: device.outletId, archivedAt: null, pinHash: { not: null } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async pinLogin(device: AuthDevice, request: PinLoginRequest): Promise<SessionResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: request.userId, outletId: device.outletId },
      include: { outlet: true },
    });
    if (!user || user.archivedAt || !user.pinHash) {
      await this.passwords.verify(null, request.pin);
      throw wrongPin();
    }
    this.lockout.assertNotLocked(user);
    if (!(await this.passwords.verify(user.pinHash, request.pin))) {
      await this.lockout.recordFailure(user.id);
      throw wrongPin();
    }
    await this.lockout.recordSuccess(user.id);
    const refresh = await this.sessions.create(user.id, PIN_SESSION_TTL_MS, device.id);
    return { body: this.sessionBody(user, user.outlet), refresh };
  }

  /**
   * A manager (or owner) types their PIN on someone else's screen to approve one action.
   * Wrong PINs count towards the approver's lockout.
   */
  async issueOverride(requester: AuthUser, request: OverrideRequest) {
    const approver = await this.prisma.user.findFirst({
      where: { id: request.userId, outletId: requester.outletId, archivedAt: null },
      include: { outlet: true },
    });
    if (!approver?.pinHash) {
      await this.passwords.verify(null, request.pin);
      throw overrideDenied();
    }
    this.lockout.assertNotLocked(approver);
    if (!(await this.passwords.verify(approver.pinHash, request.pin))) {
      await this.lockout.recordFailure(approver.id);
      throw overrideDenied();
    }
    await this.lockout.recordSuccess(approver.id);
    if (!hasPermission(approver.role, request.permission, approver.outlet)) throw overrideDenied();

    await this.audit.record({
      outletId: requester.outletId,
      actorId: approver.id,
      action: 'auth.override',
      entity: 'user',
      entityId: requester.id,
      after: { permission: request.permission, requestedBy: requester.id },
    });
    return {
      overrideToken: this.tokens.signOverride({
        sub: approver.id,
        oid: requester.outletId,
        perm: request.permission,
        req: requester.id,
      }),
      expiresInSeconds: OVERRIDE_TOKEN_TTL_SECONDS,
    };
  }

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
