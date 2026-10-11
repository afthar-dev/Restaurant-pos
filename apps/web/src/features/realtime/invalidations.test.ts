import { describe, expect, it } from 'vitest';
import { dayKeys } from '@/features/day';
import { orderKeys } from '@/features/orders';
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

  // The owner's Home shows unpaid bills, expected cash and voids, which these events move.
  it.each(['order.updated', 'bill.updated', 'day.updated', 'expense.updated'])(
    'makes the close check and the day report stale on %s',
    (event) => {
      const keys = INVALIDATIONS[event]!({ orderId: 'o1' });
      expect(keys).toContainEqual(dayKeys.closeCheck);
      expect(keys).toContainEqual(dayKeys.reports);
    },
  );

  it('makes the day report key match by prefix', () => {
    expect(dayKeys.report('d1').slice(0, dayKeys.reports.length)).toEqual(dayKeys.reports);
  });

  // Cooking and ready counts on Home come from the active orders.
  it.each(['kot.created', 'kot.updated'])('makes the active orders stale on %s', (event) => {
    expect(INVALIDATIONS[event]!({ orderId: 'o1' })).toContainEqual(orderKeys.active());
  });

  it('leaves the reports alone for kitchen-only changes', () => {
    expect(INVALIDATIONS['kot.updated']!({ orderId: 'o1' })).not.toContainEqual(reportKeys.all);
  });

  it('matches every sales report query key by prefix', () => {
    const range = { from: '2026-10-01', to: '2026-10-07' };
    expect(reportKeys.sales(range).slice(0, reportKeys.all.length)).toEqual(reportKeys.all);
    expect(reportKeys.day('d1').slice(0, reportKeys.all.length)).toEqual(reportKeys.all);
  });
});
