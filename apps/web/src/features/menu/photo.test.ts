import { describe, expect, it } from 'vitest';
import { fitWithin } from './photo';

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });
  it('leaves small photos alone', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });
});
