export const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that sign in with phone + password. Everyone else uses a PIN on a registered device. */
export const PASSWORD_ROLES: readonly Role[] = ['OWNER', 'MANAGER'];

export const PERMISSIONS = [
  'order.take',
  'order.approveQr',
  'table.manage',
  'bill.print',
  'payment.take',
  'discount.apply',
  'discount.unlimited',
  'item.cancelAfterKot',
  'bill.void',
  'day.openClose',
  'day.reopen',
  'menu.manage',
  'menu.availability',
  'settings.manage',
  'stock.manage',
  'expense.manage',
  'reports.all',
  'reports.dayClose',
  'users.manage',
  'devices.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface PermissionSettings {
  waiterCanCollectPayment: boolean;
}

const FLOOR: Permission[] = ['order.take', 'order.approveQr', 'table.manage', 'menu.availability'];
const COUNTER: Permission[] = ['bill.print', 'payment.take'];

const CASHIER: Permission[] = [...FLOOR, ...COUNTER, 'discount.apply', 'expense.manage'];

const MANAGER: Permission[] = [
  ...CASHIER,
  'discount.unlimited',
  'item.cancelAfterKot',
  'bill.void',
  'day.openClose',
  'menu.manage',
  'stock.manage',
  'reports.dayClose',
  'devices.manage',
];

/** Spec §6.1. Waiter billing rights depend on the outlet's `waiterCanCollectPayment` setting. */
export function permissionsFor(role: Role, settings: PermissionSettings): Permission[] {
  switch (role) {
    case 'OWNER':
      return [...PERMISSIONS];
    case 'MANAGER':
      return [...MANAGER];
    case 'CASHIER':
      return [...CASHIER];
    case 'WAITER':
      return settings.waiterCanCollectPayment ? [...FLOOR, ...COUNTER] : [...FLOOR];
  }
}

export function hasPermission(
  role: Role,
  permission: Permission,
  settings: PermissionSettings,
): boolean {
  return permissionsFor(role, settings).includes(permission);
}
