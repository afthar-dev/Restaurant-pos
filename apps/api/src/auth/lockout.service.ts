import { HttpStatus, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/** Locks a user for 15 minutes after 5 consecutive wrong passwords or PINs. */
@Injectable()
export class LockoutService {
  constructor(private readonly prisma: PrismaService) {}

  assertNotLocked(user: Pick<User, 'lockedUntil'>): void {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw new ApiError(HttpStatus.LOCKED, 'LOCKED', 'Too many wrong attempts. Try again later.', {
        retryAfterSeconds,
      });
    }
  }

  async recordFailure(userId: string): Promise<void> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (updated.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
      });
    }
  }

  async recordSuccess(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
}
