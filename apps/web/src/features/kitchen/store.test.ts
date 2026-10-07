import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStationFilter } from './store';

describe('KDS station filter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the bare station id, the format kitchen screens already have saved', async () => {
    localStorage.setItem('rpos.kds.station', 'grill');
    await useStationFilter.persist.rehydrate();
    expect(useStationFilter.getState().station).toBe('grill');
    useStationFilter.getState().setStation('bar');
    expect(localStorage.getItem('rpos.kds.station')).toBe('bar');
  });

  it('works in memory when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    await useStationFilter.persist.rehydrate();
    useStationFilter.getState().setStation('tandoor');
    expect(useStationFilter.getState().station).toBe('tandoor');
  });
});
