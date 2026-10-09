import { describe, expect, it } from 'vitest';
import { ageLabel } from './age';

describe('ticket age', () => {
  it('reads like a clock, not a pile of minutes', () => {
    expect([0, 7, 59, 60, 65, 120, 1439, 2321].map(ageLabel)).toEqual([
      'just now',
      '7 min',
      '59 min',
      '1 h',
      '1 h 5 min',
      '2 h',
      '23 h 59 min',
      '1 d 14 h',
    ]);
  });
});
