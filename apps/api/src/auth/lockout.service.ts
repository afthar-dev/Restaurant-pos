import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

interface Subject {
  id: string;
  outletId: string;
}

function lockedError(lockedUntil: Date | null): ApiError {
  const remainingMs = lockedUntil ? lockedUntil.getTime() - Date.now() : LOCK_DURATION_MS;
  return new ApiError(HttpStatus.LOCKED, 'LOCKED', 'Too many wrong attempts. Try again later.', {
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
  });
}

/**
 * Limits guessing to 5 wrong answers per 15 minutes.
 *
 * Each attempt is reserved atomically *before* the secret is checked, so parallel requests
 * cannot all slip past the limit. PINs are counted per user (PIN sign-in needs a registered
 * device). Passwords are counted per user and client address, so a stranger guessing from
 * one network cannot lock an owner out of every other network.
 */
@Injectable()
export class LockoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Returns this attempt's number (1–5) or throws 423 LOCKED. */
  async reservePinAttempt(user: Subject): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ pin_failed_count: number }[]>`
      UPDATE users
         SET pin_failed_count = pin_failed_count + 1, updated_at = now()
       WHERE id = ${user.id}::uuid
         AND (pin_locked_until IS NULL OR pin_locked_until <= now())
         AND pin_failed_count < ${MAX_FAILED_ATTEMPTS}
      RETURNING pin_failed_count`;
    if (rows.length === 0) {
      const current = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { pinLockedUntil: true },
      });
      throw lockedError(current?.pinLockedUntil ?? null);
    }
    return rows[0]!.pin_failed_count;
  }

  async pinFailed(user: Subject, attempt: number): Promise<void> {
    if (attempt < MAX_FAILED_ATTEMPTS) return;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { pinFailedCount: 0, pinLockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
    });
    await this.recordLock(user, 'pin');
  }

  async pinSucceeded(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pinFailedCount: 0, pinLockedUntil: null },
    });
  }

  async reservePasswordAttempt(user: Subject, ip: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ failed_count: number }[]>`
      INSERT INTO password_attempts (id, user_id, ip, failed_count, created_at, updated_at)
      VALUES (gen_random_uuid(), ${user.id}::uuid, ${ip}, 1, now(), now())
      ON CONFLICT (user_id, ip) DO UPDATE
         SET failed_count = password_attempts.failed_count + 1, updated_at = now()
       WHERE (password_attempts.locked_until IS NULL OR password_attempts.locked_until <= now())
         AND password_attempts.failed_count < ${MAX_FAILED_ATTEMPTS}
      RETURNING failed_count`;
    if (rows.length === 0) {
      const current = await this.prisma.passwordAttempt.findUnique({
        where: { userId_ip: { userId: user.id, ip } },
        select: { lockedUntil: true },
      });
      throw lockedError(current?.lockedUntil ?? null);
    }
    return rows[0]!.failed_count;
  }

  async passwordFailed(user: Subject, ip: string, attempt: number): Promise<void> {
    if (attempt < MAX_FAILED_ATTEMPTS) return;
    await this.prisma.passwordAttempt.update({
      where: { userId_ip: { userId: user.id, ip } },
      data: { failedCount: 0, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
    });
    await this.recordLock(user, 'password', ip);
  }

  async passwordSucceeded(userId: string, ip: string): Promise<void> {
    await this.prisma.passwordAttempt.deleteMany({ where: { userId, ip } });
  }

  /** Clears every lock for a user, e.g. after the owner resets their PIN or password. */
  async unlock(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pinFailedCount: 0, pinLockedUntil: null },
    });
    await this.prisma.passwordAttempt.deleteMany({ where: { userId } });
  }

  private async recordLock(user: Subject, kind: 'pin' | 'password', ip?: string): Promise<void> {
    await this.audit.record({
      outletId: user.outletId,
      actorId: null,
      action: 'auth.locked',
      entity: 'user',
      entityId: user.id,
      after: ip ? { kind, ip } : { kind },
    });
  }
}
