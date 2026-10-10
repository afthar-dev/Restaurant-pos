import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './id';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('returns a version 4 UUID', () => {
    expect(newId()).toMatch(V4);
  });

  it('still returns distinct version 4 UUIDs where crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const first = newId();
    expect(first).toMatch(V4);
    expect(newId()).not.toBe(first);
  });
});
