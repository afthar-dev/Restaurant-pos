import { describe, expect, it, vi } from 'vitest';
import { fetchHealth } from './health';

describe('fetchHealth', () => {
  it('gives up when the server does not answer within the timeout', async () => {
    // Behaves like real fetch: never settles on its own, rejects when its signal aborts.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    await expect(fetchHealth(undefined, 20)).rejects.toThrow(/timed out/);
  });
});
