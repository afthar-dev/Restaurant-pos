import type { Permission } from '@rpos/shared';

export type StepId = 'details' | 'menu' | 'tables' | 'printer' | 'staff' | 'device';

type OutletLike = {
  name: string;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  taxScheme: 'REGULAR' | 'COMPOSITION' | 'NONE';
};

/** What the checks read; a missing field means that data is still loading. */
export interface SetupData {
  outlet?: OutletLike;
  menu?: { categories: { items: unknown[] }[] };
  floor?: { tables: unknown[] }[];
  printers?: { purpose: 'KOT' | 'BILL' }[];
  staff?: { role: string; hasPin: boolean; archivedAt: string | null }[];
  devices?: { revokedAt: string | null }[];
}

export type StepStatus = 'done' | 'todo' | 'skipped' | 'loading' | 'error';

export interface StepView {
  id: StepId;
  title: string;
  help: string;
  path: string;
  skipLabel?: string;
  status: StepStatus;
}

export interface SetupProgress {
  steps: StepView[];
  done: number;
  total: number;
  complete: boolean;
  loading: boolean;
  failed: boolean;
}

interface StepDef extends Omit<StepView, 'status'> {
  permission: Permission;
  /** undefined while its data loads. */
  isDone: (data: SetupData) => boolean | undefined;
}

const filled = (value: string | null | undefined) => Boolean(value?.trim());

/** The seed names the outlet this; it does not count as filled in. */
const SEEDED_NAME = 'main outlet';

const STEPS: StepDef[] = [
  {
    id: 'details',
    title: 'Restaurant details',
    help: 'Your name, address, phone and GSTIN print on every bill.',
    path: '/admin/settings',
    permission: 'settings.manage',
    isDone: ({ outlet }) =>
      outlet &&
      outlet.name.trim().toLowerCase() !== SEEDED_NAME &&
      filled(outlet.address) &&
      filled(outlet.phone) &&
      (outlet.taxScheme === 'NONE' || filled(outlet.gstin)),
  },
  {
    id: 'menu',
    title: 'Menu',
    help: 'Add the dishes you sell with their prices. Categories decide which kitchen gets the ticket.',
    path: '/admin/menu',
    permission: 'menu.manage',
    isDone: ({ menu }) => menu && menu.categories.some((c) => c.items.length > 0),
  },
  {
    id: 'tables',
    title: 'Tables and QR stickers',
    help: 'Add your dining areas and tables, then print the QR stickers customers scan to order.',
    path: '/admin/tables',
    skipLabel: 'We only do parcels',
    permission: 'settings.manage',
    isDone: ({ floor }) => floor && floor.some((a) => a.tables.length > 0),
  },
  {
    id: 'printer',
    title: 'Bill printer',
    help: "Connect the printer for bills. Without one, bills print from the browser's print window.",
    path: '/admin/kitchen',
    skipLabel: "Print bills from this computer's browser",
    permission: 'settings.manage',
    isDone: ({ printers }) => printers && printers.some((p) => p.purpose === 'BILL'),
  },
  {
    id: 'staff',
    title: 'Staff',
    help: 'Give cashiers and waiters their own PIN so every order shows who took it.',
    path: '/admin/staff',
    skipLabel: 'I run the counter myself',
    permission: 'users.manage',
    isDone: ({ staff }) =>
      staff && staff.some((s) => s.role !== 'OWNER' && s.hasPin && s.archivedAt === null),
  },
  {
    id: 'device',
    title: 'This counter',
    help: 'Register this computer as the counter so staff can sign in here with their PIN.',
    path: '/admin/devices',
    permission: 'devices.manage',
    isDone: ({ devices }) => devices && devices.some((d) => d.revokedAt === null),
  },
];

export const SETUP_PERMISSIONS: Permission[] = [...new Set(STEPS.map((s) => s.permission))];

/**
 * Which setup steps this user sees and where each stands. Done always wins over skipped; a
 * check that failed or is still loading never counts as complete.
 */
export function setupProgress(input: {
  permissions: readonly string[];
  skipped: readonly string[];
  data: SetupData;
  failed: readonly StepId[];
}): SetupProgress {
  const steps: StepView[] = STEPS.filter((s) => input.permissions.includes(s.permission)).map(
    ({ permission: _permission, isDone, ...step }) => {
      const done = isDone(input.data);
      const status: StepStatus = input.failed.includes(step.id)
        ? 'error'
        : done === undefined
          ? 'loading'
          : done
            ? 'done'
            : step.skipLabel && input.skipped.includes(step.id)
              ? 'skipped'
              : 'todo';
      return { ...step, status };
    },
  );
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return {
    steps,
    done,
    total: steps.length,
    complete: steps.length > 0 && done === steps.length,
    loading: steps.some((s) => s.status === 'loading'),
    failed: steps.some((s) => s.status === 'error'),
  };
}
