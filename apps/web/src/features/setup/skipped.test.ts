import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSkipped, writeSkipped } from './skipped';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('skipped steps storage', () => {
  it('round-trips the skipped ids', () => {
    writeSkipped(['tables', 'staff']);
    expect(readSkipped()).toEqual(['tables', 'staff']);
  });

  it('reads garbage as nothing skipped', () => {
    localStorage.setItem('rpos.setup.skipped', '{oops');
    expect(readSkipped()).toEqual([]);
    localStorage.setItem('rpos.setup.skipped', '[1,"tables",null]');
    expect(readSkipped()).toEqual(['tables']);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSkipped()).toEqual([]);
    expect(() => writeSkipped(['tables'])).not.toThrow();
  });
});
