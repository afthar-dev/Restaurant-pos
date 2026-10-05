import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DEVICE_COOKIE } from '../auth/cookies';
import { sha256 } from './crypto';

/**
 * The whole restaurant reaches the cloud server from one public IP, so per-IP limits would
 * make every counter and phone share one budget. Requests carrying a device cookie are
 * counted per device instead.
 *
 * Password login stays per IP: it is public, and a made-up cookie must not buy a fresh
 * budget for guessing. A made-up cookie on PIN routes gains nothing because DeviceGuard
 * rejects it.
 */
@Injectable()
export class RposThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const deviceToken = cookies?.[DEVICE_COOKIE];
    const path = typeof req.path === 'string' ? req.path : '';
    if (
      typeof deviceToken === 'string' &&
      deviceToken.length > 0 &&
      !path.endsWith('/auth/login')
    ) {
      return `device:${sha256(deviceToken)}`;
    }
    return typeof req.ip === 'string' ? req.ip : 'unknown';
  }
}
