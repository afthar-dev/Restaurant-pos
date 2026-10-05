import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { randomToken, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

export const PASSWORD_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface RotatedSession extends IssuedSession {
  userId: string;
  deviceId: string | null;
}

/**
 * Opaque refresh tokens. Only SHA-256 hashes are stored. Every refresh rotates the token;
 * presenting a token that was already rotated or revoked is treated as theft and revokes
 * the whole family (every token descended from the same login).
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    ttlMs: number,
    deviceId: string | null = null,
  ): Promise<IssuedSession> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.refreshSession.create({
      data: { userId, deviceId, familyId: randomUUID(), tokenHash: sha256(token), expiresAt },
    });
    return { token, expiresAt };
  }

  async rotate(token: string): Promise<RotatedSession | null> {
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!session) return null;
    if (session.revokedAt || session.rotatedAt) {
      await this.revokeFamily(session.familyId);
      return null;
    }
    if (session.expiresAt <= new Date()) return null;

    const next = randomToken();
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Conditional update: if two requests race with the same token, only one wins.
      const claimed = await tx.refreshSession.updateMany({
        where: { id: session.id, rotatedAt: null, revokedAt: null },
        data: { rotatedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.refreshSession.create({
        data: {
          userId: session.userId,
          deviceId: session.deviceId,
          familyId: session.familyId,
          tokenHash: sha256(next),
          expiresAt: session.expiresAt,
        },
      });
      return true;
    });
    if (!rotated) {
      await this.revokeFamily(session.familyId);
      return null;
    }
    return {
      token: next,
      expiresAt: session.expiresAt,
      userId: session.userId,
      deviceId: session.deviceId,
    };
  }

  async revokeByToken(token: string): Promise<void> {
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (session) await this.revokeFamily(session.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForDevice(deviceId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
