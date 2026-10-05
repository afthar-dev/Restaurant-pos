import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import type { CreateUserRequest, UpdateUserRequest } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

export interface StaffView {
  id: string;
  name: string;
  phone: string;
  role: User['role'];
  hasPassword: boolean;
  hasPin: boolean;
  archivedAt: Date | null;
  lockedUntil: Date | null;
}

function toStaff(user: User): StaffView {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    hasPassword: user.passwordHash !== null,
    hasPin: user.pinHash !== null,
    archivedAt: user.archivedAt,
    lockedUntil: user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil : null,
  };
}

const phoneTaken = () =>
  new ApiError(HttpStatus.CONFLICT, 'PHONE_TAKEN', 'Someone already uses this phone number.');

const lastOwner = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'LAST_OWNER',
    'There must always be at least one active owner.',
  );

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(outletId: string): Promise<StaffView[]> {
    const users = await this.prisma.user.findMany({
      where: { outletId },
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    });
    return users.map(toStaff);
  }

  async create(actor: AuthUser, request: CreateUserRequest): Promise<StaffView> {
    try {
      const user = await this.prisma.user.create({
        data: {
          outletId: actor.outletId,
          name: request.name,
          phone: request.phone,
          role: request.role,
          passwordHash: request.password ? await this.passwords.hash(request.password) : null,
          pinHash: request.pin ? await this.passwords.hash(request.pin) : null,
        },
      });
      await this.audit.record({
        outletId: actor.outletId,
        actorId: actor.id,
        action: 'user.create',
        entity: 'user',
        entityId: user.id,
        after: { name: user.name, phone: user.phone, role: user.role },
      });
      return toStaff(user);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async update(actor: AuthUser, userId: string, request: UpdateUserRequest): Promise<StaffView> {
    const user = await this.findInOutlet(actor.outletId, userId);
    if (request.role && request.role !== 'OWNER') await this.assertNotLastOwner(user);

    const credentialsChanged = request.password !== undefined || request.pin !== undefined;
    const data: Prisma.UserUpdateInput = {
      name: request.name,
      phone: request.phone,
      role: request.role,
    };
    if (request.password !== undefined) {
      data.passwordHash = request.password ? await this.passwords.hash(request.password) : null;
    }
    if (request.pin !== undefined) {
      data.pinHash = request.pin ? await this.passwords.hash(request.pin) : null;
    }
    if (credentialsChanged) {
      data.failedLoginCount = 0;
      data.lockedUntil = null;
    }

    let updated: User;
    try {
      updated = await this.prisma.user.update({ where: { id: user.id }, data });
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
    if (credentialsChanged || (request.role && request.role !== user.role)) {
      await this.sessions.revokeAllForUser(user.id);
    }

    const before: Record<string, string> = {};
    const after: Record<string, string | boolean> = {};
    for (const key of ['name', 'phone', 'role'] as const) {
      if (request[key] !== undefined && request[key] !== user[key]) {
        before[key] = user[key];
        after[key] = updated[key];
      }
    }
    if (request.password !== undefined) after.passwordChanged = true;
    if (request.pin !== undefined) after.pinChanged = true;
    await this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action: 'user.update',
      entity: 'user',
      entityId: user.id,
      before,
      after,
    });
    return toStaff(updated);
  }

  async archive(actor: AuthUser, userId: string): Promise<StaffView> {
    if (userId === actor.id) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'CANNOT_ARCHIVE_SELF',
        'You cannot archive yourself.',
      );
    }
    const user = await this.findInOutlet(actor.outletId, userId);
    if (user.archivedAt) return toStaff(user);
    await this.assertNotLastOwner(user);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { archivedAt: new Date() },
    });
    await this.sessions.revokeAllForUser(user.id);
    await this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action: 'user.archive',
      entity: 'user',
      entityId: user.id,
      before: { name: user.name, role: user.role },
    });
    return toStaff(updated);
  }

  async restore(actor: AuthUser, userId: string): Promise<StaffView> {
    const user = await this.findInOutlet(actor.outletId, userId);
    if (!user.archivedAt) return toStaff(user);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { archivedAt: null, failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action: 'user.restore',
      entity: 'user',
      entityId: user.id,
      after: { name: user.name, role: user.role },
    });
    return toStaff(updated);
  }

  private async findInOutlet(outletId: string, userId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, outletId } });
    if (!user) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Staff member not found.');
    return user;
  }

  private async assertNotLastOwner(user: User): Promise<void> {
    if (user.role !== 'OWNER' || user.archivedAt) return;
    const otherOwners = await this.prisma.user.count({
      where: { outletId: user.outletId, role: 'OWNER', archivedAt: null, id: { not: user.id } },
    });
    if (otherOwners === 0) throw lastOwner();
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return phoneTaken();
    }
    return error;
  }
}
