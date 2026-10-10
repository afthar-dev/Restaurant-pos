import { describe, expect, it } from 'vitest';
import { reportKeys } from '@/features/reports';
import { INVALIDATIONS } from './invalidations';

describe('INVALIDATIONS', () => {
  // Bills, payments, voids, days and expenses all change the sales figures on Home and Reports.
  it.each(['bill.updated', 'day.updated', 'expense.updated'])(
    'makes the sales reports stale on %s',
    (event) => {
      const keys = INVALIDATIONS[event]!({ orderId: 'o1' });
      expect(keys).toContainEqual(reportKeys.all);
    },
  );

  it('leaves the reports alone for kitchen-only changes', () => {
    expect(INVALIDATIONS['kot.updated']!({ orderId: 'o1' })).not.toContainEqual(reportKeys.all);
  });

  it('matches every sales report query key by prefix', () => {
    const range = { from: '2026-10-01', to: '2026-10-07' };
    expect(reportKeys.sales(range).slice(0, reportKeys.all.length)).toEqual(reportKeys.all);
    expect(reportKeys.day('d1').slice(0, reportKeys.all.length)).toEqual(reportKeys.all);
  });
});
