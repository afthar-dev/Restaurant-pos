const KEY = 'rpos.setup.skipped';

/** Setup steps skipped in this browser. Anything unreadable counts as none. */
export function readSkipped(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeSkipped(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Private window or blocked storage: the skip lasts until reload.
  }
}
