import type { Permission, Role } from '@rpos/shared';
import { create } from 'zustand';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export interface SessionBody {
  accessToken: string;
  user: SessionUser;
  permissions: string[];
}

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: SessionUser | null;
  permissions: Permission[];
  /** The last session check could not reach the server (network down, 5xx). */
  unreachable: boolean;
  setSession: (body: SessionBody) => void;
  setUnreachable: (unreachable: boolean) => void;
  clear: () => void;
}

const initial = {
  status: 'loading' as SessionStatus,
  accessToken: null,
  user: null,
  permissions: [] as Permission[],
  unreachable: false,
};

/** The access token lives only in memory; the refresh token is an httpOnly cookie. */
export const useSession = create<SessionState>()((set) => ({
  ...initial,
  setSession: (body) =>
    set({
      status: 'authenticated',
      accessToken: body.accessToken,
      user: body.user,
      permissions: body.permissions as Permission[],
      unreachable: false,
    }),
  setUnreachable: (unreachable) => set({ unreachable }),
  clear: () =>
    set({
      status: 'anonymous',
      accessToken: null,
      user: null,
      permissions: [],
      unreachable: false,
    }),
}));

export function resetSessionStore(): void {
  useSession.setState(initial);
}

export function useCan(permission: Permission): boolean {
  return useSession((s) => s.permissions.includes(permission));
}
