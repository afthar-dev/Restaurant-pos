import { Throttle } from '@nestjs/throttler';

const ONE_MINUTE_MS = 60_000;

function limitFromEnv(name: string, fallback: number): () => number {
  return () => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
}

/** Requests per minute per client IP for any route. */
export const apiThrottleLimit = limitFromEnv('API_THROTTLE_LIMIT', 300);

/** Tighter per-minute limit for login, PIN login and override (guessable secrets). */
export const ThrottleAuth = () =>
  Throttle({ default: { limit: limitFromEnv('AUTH_THROTTLE_LIMIT', 10), ttl: ONE_MINUTE_MS } });

export const THROTTLE_WINDOW_MS = ONE_MINUTE_MS;

/**
 * Scanning a table QR, per client IP. Diners at a busy restaurant share its Wi-Fi IP, and the
 * sticker code is 32 random bytes, so this is far looser than the staff sign-in limit.
 */
export const ThrottleQrSession = () =>
  Throttle({
    default: { limit: limitFromEnv('QR_SESSION_THROTTLE_LIMIT', 120), ttl: ONE_MINUTE_MS },
  });
