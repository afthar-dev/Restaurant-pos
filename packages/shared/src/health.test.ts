import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('accepts the ok and error shapes', () => {
    expect(healthResponseSchema.parse({ status: 'ok', db: 'up' })).toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(healthResponseSchema.parse({ status: 'error', db: 'down' })).toEqual({
      status: 'error',
      db: 'down',
    });
  });

  it('rejects anything else', () => {
    expect(() => healthResponseSchema.parse({ status: 'fine' })).toThrow();
    expect(() => healthResponseSchema.parse('<html>')).toThrow();
  });
});
