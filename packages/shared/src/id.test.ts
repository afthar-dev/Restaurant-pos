import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { newId } from './id';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A page served over plain http: crypto exists, but randomUUID does not. */
const insecureCrypto = () =>
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('returns a version 4 UUID', () => {
    expect(newId()).toMatch(V4);
  });

  it('uses crypto.randomUUID when it exists', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(newId()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('still returns a version 4 UUID where crypto.randomUUID is missing', () => {
    insecureCrypto();
    const first = newId();
    expect(first).toMatch(V4);
    expect(newId()).not.toBe(first);
  });

  it('builds the fallback from the random bytes, setting version and variant bits', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff),
    });
    expect(newId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('passes the same validation the API applies to ids', () => {
    insecureCrypto();
    expect(() => z.uuid().parse(newId())).not.toThrow();
  });
});
