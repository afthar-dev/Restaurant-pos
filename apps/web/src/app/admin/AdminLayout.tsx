import type { Permission } from '@rpos/shared';
import { Navigate, NavLink, Outlet } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { useSession } from '@/shared/session/store';
import { EmptyState, PageHeader } from '@/shared/ui';
import { Settings2 } from 'lucide-react';

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
    return (
      <EmptyState
        icon={<Settings2 />}
        title="Nothing to set up here"
        description="Your role cannot change the restaurant setup. Ask the owner if something needs to change."
      />
    );
  }
  return <Navigate to={tabs[0]!.to} replace />;
}

export function AdminLayout() {
  const tabs = useAllowedTabs();
  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Admin"
        description="Set up the menu, tables, kitchen, staff and devices. Changes apply to every screen straight away."
      />
      <nav
        aria-label="Admin sections"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 shadow-[inset_0_-1px_0_var(--color-border)]"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'border-primary-700 text-primary-800'
                  : 'border-transparent text-muted hover:border-border-strong hover:text-text',
              )
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
