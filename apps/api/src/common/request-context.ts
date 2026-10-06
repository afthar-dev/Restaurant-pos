import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { DeviceType, Permission, Role } from '@rpos/shared';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  outletId: string;
}

export interface AuthDevice {
  id: string;
  name: string;
  type: DeviceType;
  outletId: string;
}

export interface QrContext {
  sessionId: string;
  outletId: string;
  tableId: string;
}

export interface RequestContext extends Request {
  user?: AuthUser;
  permissions?: Permission[];
  /** The person accountable for the action: the user, or the manager who approved an override. */
  actor?: AuthUser;
  device?: AuthDevice;
  /** Set by QrSessionGuard for customers ordering from a table QR. */
  qr?: QrContext;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<RequestContext>();
  if (!req.user) throw new Error('CurrentUser used on a route without AccessGuard');
  return req.user;
});

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<RequestContext>();
  const actor = req.actor ?? req.user;
  if (!actor) throw new Error('CurrentActor used on a route without AccessGuard');
  return actor;
});
