import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCart } from '@/features/cart';
import { useSession } from './store';

const CODE = 'table-code';
const session = { token: 'session-1', table: 'T1', outlet: 'Spice Garden' };

describe('session store', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the session per table in the format phones already have saved', () => {
    useSession.getState().open(CODE, session);
    expect(JSON.parse(localStorage.getItem(`rpos.qr.${CODE}`) ?? 'null')).toEqual(session);
    useSession.setState({ code: null, session: null });
    expect(useSession.getState().restore(CODE)).toEqual(session);
  });

  it('ends the session: forgets it on this phone and empties the cart', () => {
    useSession.getState().open(CODE, session);
    useCart.getState().add({
      key: 'k',
      variantId: 'v',
      addonIds: [],
      quantity: 1,
      label: 'Roti',
      unitPrice: 2500,
    });
    useSession.getState().end('session-1');
    expect(useSession.getState()).toMatchObject({ session: null, ended: true });
    expect(localStorage.getItem(`rpos.qr.${CODE}`)).toBeNull();
    expect(useCart.getState().lines).toEqual([]);
  });

  it('ignores a late "ended" answer for an older session', () => {
    useSession.getState().open(CODE, session);
    useSession.getState().end('old-session');
    expect(useSession.getState()).toMatchObject({ session, ended: false });
  });

  it('works for the open page when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    useSession.getState().open(CODE, session);
    expect(useSession.getState().session).toEqual(session);
    expect(useSession.getState().restore(CODE)).toEqual(session);
    expect(useSession.getState().restore('another-table')).toBeNull();
  });
});
