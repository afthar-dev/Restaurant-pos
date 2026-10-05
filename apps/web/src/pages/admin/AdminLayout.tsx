import type { Permission } from '@rpos/shared';
import { Navigate, NavLink, Outlet } from 'react-router';
import { useSession } from '../../auth/store';

export const ADMIN_TABS: { to: string; label: string; permission: Permission }[] = [
  { to: 'menu', label: 'Menu', permission: 'menu.manage' },
  { to: 'addons', label: 'Add-ons', permission: 'menu.manage' },
  { to: 'staff', label: 'Staff', permission: 'users.manage' },
  { to: 'settings', label: 'Settings', permission: 'settings.manage' },
  { to: 'tables', label: 'Tables', permission: 'settings.manage' },
  { to: 'kitchen', label: 'Kitchen', permission: 'settings.manage' },
  { to: 'tax', label: 'Tax', permission: 'settings.manage' },
  { to: 'devices', label: 'Devices', permission: 'devices.manage' },
  { to: 'audit', label: 'Audit log', permission: 'audit.view' },
];

function useAllowedTabs() {
  const permissions = useSession((s) => s.permissions);
  return ADMIN_TABS.filter((t) => permissions.includes(t.permission));
}

export function AdminIndex() {
  const tabs = useAllowedTabs();
  if (tabs.length === 0) {
    return <p className="text-slate-600">Menu and table setup arrive in the next milestone.</p>;
  }
  return <Navigate to={tabs[0]!.to} replace />;
}

export function AdminLayout() {
  const tabs = useAllowedTabs();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <nav
        aria-label="Admin sections"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-2"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm font-medium ${
                isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}
