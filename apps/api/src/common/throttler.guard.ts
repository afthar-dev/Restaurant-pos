import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { DEVICE_COOKIE } from '../auth/cookies';
import { PrismaService } from '../prisma/prisma.service';
import { sha256 } from './crypto';

/**
 * The whole restaurant reaches the cloud server from one public IP, so per-IP limits would
 * make every counter and phone share one budget. Requests carrying a device cookie are
 * counted per device instead, and diners' phones on customer QR routes per QR session.
 *
 * Password login stays per IP: it is public, and a made-up cookie must not buy a fresh
 * budget for guessing. A made-up cookie on PIN routes gains nothing because DeviceGuard
 * rejects it. A QR session header only counts when it belongs to a live session, and only
 * on the customer QR routes, so a made-up header buys nothing anywhere.
 */
@Injectable()
export class RposThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    super(options, storage, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const path = typeof req.path === 'string' ? req.path : '';
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';

    const headers = req.headers as Record<string, unknown> | undefined;
    const qrToken = headers?.['x-qr-session'];
    const customerQrRoute = path.startsWith('/api/qr/') && !path.startsWith('/api/qr/sessions');
    if (customerQrRoute && typeof qrToken === 'string' && qrToken.length > 0) {
      const session = await this.prisma.qrSession.findUnique({
        where: { tokenHash: sha256(qrToken) },
        select: { id: true, endedAt: true },
      });
      return session && !session.endedAt ? `qr:${session.id}` : ip;
    }

    const cookies = req.cookies as Record<string, unknown> | undefined;
    const deviceToken = cookies?.[DEVICE_COOKIE];
    if (
      typeof deviceToken === 'string' &&
      deviceToken.length > 0 &&
      !path.endsWith('/auth/login')
    ) {
      return `device:${sha256(deviceToken)}`;
    }
    return ip;
  }
}
