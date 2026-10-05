import type { Permission } from '@rpos/shared';
import { Link } from 'react-router';
import { useSession } from '../auth/store';

export const ADMIN_PERMISSIONS: Permission[] = [
  'users.manage',
  'settings.manage',
  'devices.manage',
  'menu.manage',
  'audit.view',
];

interface Area {
  to: string;
  title: string;
  short: string;
  body: string;
  /** Shown when the user has any of these; empty means everyone. */
  anyOf: Permission[];
}

export const AREAS: Area[] = [
  {
    to: '/pos',
    title: 'POS counter',
    short: 'POS',
    body: 'Cashier billing, parcel orders and payments.',
    anyOf: ['bill.print'],
  },
  {
    to: '/captain',
    title: 'Captain app',
    short: 'Captain',
    body: 'Waiters take table orders on their phones.',
    anyOf: ['order.take'],
  },
  {
    to: '/kds',
    title: 'Kitchen display',
    short: 'Kitchen',
    body: 'Live KOTs for the kitchen screen.',
    anyOf: [],
  },
  {
    to: '/admin',
    title: 'Admin',
    short: 'Admin',
    body: 'Staff, devices, outlet settings and the audit log.',
    anyOf: ADMIN_PERMISSIONS,
  },
];

export function visibleAreas(permissions: Permission[]): Area[] {
  if (permissions.length === 0) return [];
  return AREAS.filter((a) => a.anyOf.length === 0 || a.anyOf.some((p) => permissions.includes(p)));
}

export function Home() {
  const permissions = useSession((s) => s.permissions);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Restaurant POS</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleAreas(permissions).map((area) => (
          <Link
            key={area.to}
            to={area.to}
            className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            <span className="font-semibold">{area.title}</span>
            <span className="text-sm text-slate-600">{area.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
