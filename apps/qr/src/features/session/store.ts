import { create } from 'zustand';
import { useCart } from '@/features/cart';
import { forgetSession, loadSession, saveSession, type StoredSession } from './storage';

interface SessionState {
  /** The table code from the sticker this session belongs to. */
  code: string | null;
  session: StoredSession | null;
  /** The server closed the session (the table paid or was cleared). */
  ended: boolean;
  /**
   * Picks up the session this phone already has for the table, if any: the one in memory,
   * else the saved one (storage may be blocked, then only the open page keeps it).
   */
  restore: (code: string) => StoredSession | null;
  open: (code: string, session: StoredSession) => void;
  /**
   * Forgets the session the server says has ended. A late answer for an older session is
   * ignored, so it cannot end the one just started.
   */
  end: (token: string) => void;
}

export const useSession = create<SessionState>()((set, get) => ({
  code: null,
  session: null,
  ended: false,
  restore: (code) => {
    const current = get();
    if (current.code === code && current.session) return current.session;
    const stored = loadSession(code);
    set({ code, session: stored, ended: false });
    return stored;
  },
  open: (code, session) => {
    saveSession(code, session);
    set({ code, session, ended: false });
  },
  end: (token) => {
    const { code, session } = get();
    if (!code || session?.token !== token) return;
    forgetSession(code);
    useCart.getState().clear();
    set({ session: null, ended: true });
  },
}));
