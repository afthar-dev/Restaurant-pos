import type { CookieOptions } from 'express';

export const REFRESH_COOKIE = 'rpos_rt';
export const DEVICE_COOKIE = 'rpos_dt';

const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

export function refreshCookieOptions(secure: boolean, expires?: Date): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure, path: '/api/auth', expires };
}

export function deviceCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/api',
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
  };
}
