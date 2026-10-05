import { describe, expect, it } from 'vitest';
import { hasPermission, PERMISSIONS, permissionsFor } from './auth';

const defaults = { waiterCanCollectPayment: false };

describe('permissionsFor', () => {
  it('gives the owner every permission', () => {
    expect([...permissionsFor('OWNER', defaults)].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('keeps owner-only permissions away from the manager', () => {
    for (const p of [
      'day.reopen',
      'settings.manage',
      'users.manage',
      'reports.all',
      'audit.view',
    ] as const) {
      expect(hasPermission('MANAGER', p, defaults)).toBe(false);
    }
    for (const p of [
      'bill.void',
      'devices.manage',
      'discount.unlimited',
      'day.openClose',
    ] as const) {
      expect(hasPermission('MANAGER', p, defaults)).toBe(true);
    }
  });

  it('lets a cashier discount within the cap but not void or discount freely', () => {
    expect(hasPermission('CASHIER', 'discount.apply', defaults)).toBe(true);
    expect(hasPermission('CASHIER', 'discount.unlimited', defaults)).toBe(false);
    expect(hasPermission('CASHIER', 'bill.void', defaults)).toBe(false);
    expect(hasPermission('CASHIER', 'payment.take', defaults)).toBe(true);
  });

  it('lets a waiter collect payment only when the outlet allows it', () => {
    expect(hasPermission('WAITER', 'payment.take', defaults)).toBe(false);
    expect(hasPermission('WAITER', 'bill.print', defaults)).toBe(false);
    const allowed = { waiterCanCollectPayment: true };
    expect(hasPermission('WAITER', 'payment.take', allowed)).toBe(true);
    expect(hasPermission('WAITER', 'bill.print', allowed)).toBe(true);
    expect(hasPermission('WAITER', 'discount.apply', allowed)).toBe(false);
  });

  it('never returns duplicates', () => {
    for (const role of ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'] as const) {
      const perms = permissionsFor(role, { waiterCanCollectPayment: true });
      expect(new Set(perms).size).toBe(perms.length);
    }
  });
});
