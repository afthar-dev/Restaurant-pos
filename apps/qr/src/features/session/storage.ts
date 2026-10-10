export interface StoredSession {
  token: string;
  table: string;
  outlet: string;
  /** The restaurant logo, if it has one (absent in sessions saved before logos existed). */
  logoUrl?: string | null;
}

const keyFor = (code: string) => `rpos.qr.${code}`;

/** The session for this table on this phone, kept across reloads (storage may be blocked). */
export function loadSession(code: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(keyFor(code));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: StoredSession) {
  try {
    localStorage.setItem(keyFor(code), JSON.stringify(session));
  } catch {
    // Private mode: the session lasts while this page stays open.
  }
}

export function forgetSession(code: string) {
  try {
    localStorage.removeItem(keyFor(code));
  } catch {
    // Nothing stored.
  }
}
