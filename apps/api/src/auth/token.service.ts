import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Permission, Role } from '@rpos/shared';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const OVERRIDE_TOKEN_TTL_SECONDS = 60;

interface AccessClaims {
  sub: string;
  role: Role;
  oid: string;
  typ: 'access';
}

export interface OverrideClaims {
  sub: string;
  oid: string;
  perm: Permission;
  /** User who asked for the override. */
  req: string;
  typ: 'override';
  /** Unique id; the token is consumed on first use. */
  jti: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccess(user: { id: string; role: Role; outletId: string }): string {
    const claims: AccessClaims = {
      sub: user.id,
      role: user.role,
      oid: user.outletId,
      typ: 'access',
    };
    return this.jwt.sign(claims, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  /** Returns the user id, or null when the token is missing, malformed, expired or not an access token. */
  verifyAccess(token: string): { userId: string } | null {
    try {
      const claims = this.jwt.verify<AccessClaims>(token);
      return claims.typ === 'access' ? { userId: claims.sub } : null;
    } catch {
      return null;
    }
  }

  signOverride(
    claims: Omit<OverrideClaims, 'typ' | 'jti'>,
    ttlSeconds = OVERRIDE_TOKEN_TTL_SECONDS,
  ): string {
    return this.jwt.sign(
      { ...claims, typ: 'override' },
      { expiresIn: ttlSeconds, jwtid: randomUUID() },
    );
  }

  verifyOverride(token: string): OverrideClaims | null {
    try {
      const claims = this.jwt.verify<OverrideClaims>(token);
      return claims.typ === 'override' && typeof claims.jti === 'string' ? claims : null;
    } catch {
      return null;
    }
  }
}
