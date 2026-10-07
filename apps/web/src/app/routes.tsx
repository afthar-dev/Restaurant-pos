import type { RouteObject } from 'react-router';
import { LoginPage, PinPage, RequireAuth } from '@/features/auth';
import { AppShell } from './AppShell';
import { AddonsPage, AvailabilityPage, MenuPage } from '@/features/menu';
import { CaptainPage, PosPage } from '@/features/service';
import { DayPage } from '@/features/day';
import { KdsPage } from '@/features/kitchen';
import { ADMIN_PERMISSIONS, Home } from './Home';
import { NotFound } from './NotFound';
import { AdminIndex, AdminLayout } from './admin/AdminLayout';
import { AuditPage } from '@/features/audit';
import { DevicesPage } from '@/features/devices';
import { KitchenPage } from '@/features/kitchen-setup';
import { TablesPage } from '@/features/tables';
import { TaxPage } from '@/features/tax';
import { SettingsPage } from '@/features/settings';
import { StaffPage } from '@/features/staff';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <RequireAuth>
            <Home />
          </RequireAuth>
        ),
      },
      { path: 'login', element: <LoginPage /> },
      { path: 'pin', element: <PinPage /> },
      {
        path: 'pos',
        element: (
          <RequireAuth anyOf={['bill.print']}>
            <PosPage />
          </RequireAuth>
        ),
      },
      {
        path: 'captain',
        element: (
          <RequireAuth anyOf={['order.take']}>
            <CaptainPage />
          </RequireAuth>
        ),
      },
      {
        path: 'availability',
        element: (
          <RequireAuth anyOf={['menu.availability']}>
            <AvailabilityPage />
          </RequireAuth>
        ),
      },
      {
        path: 'day',
        element: (
          <RequireAuth anyOf={['day.openClose', 'reports.dayClose']}>
            <DayPage />
          </RequireAuth>
        ),
      },
      {
        path: 'kds',
        element: <KdsPage />,
      },
      {
        path: 'admin',
        element: (
          <RequireAuth anyOf={ADMIN_PERMISSIONS}>
            <AdminLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <AdminIndex /> },
          {
            path: 'menu',
            element: (
              <RequireAuth anyOf={['menu.manage']}>
                <MenuPage />
              </RequireAuth>
            ),
          },
          {
            path: 'addons',
            element: (
              <RequireAuth anyOf={['menu.manage']}>
                <AddonsPage />
              </RequireAuth>
            ),
          },
          {
            path: 'staff',
            element: (
              <RequireAuth anyOf={['users.manage']}>
                <StaffPage />
              </RequireAuth>
            ),
          },
          {
            path: 'settings',
            element: (
              <RequireAuth anyOf={['settings.manage']}>
                <SettingsPage />
              </RequireAuth>
            ),
          },
          {
            path: 'tables',
            element: (
              <RequireAuth anyOf={['settings.manage']}>
                <TablesPage />
              </RequireAuth>
            ),
          },
          {
            path: 'kitchen',
            element: (
              <RequireAuth anyOf={['settings.manage']}>
                <KitchenPage />
              </RequireAuth>
            ),
          },
          {
            path: 'tax',
            element: (
              <RequireAuth anyOf={['settings.manage']}>
                <TaxPage />
              </RequireAuth>
            ),
          },
          {
            path: 'devices',
            element: (
              <RequireAuth anyOf={['devices.manage']}>
                <DevicesPage />
              </RequireAuth>
            ),
          },
          {
            path: 'audit',
            element: (
              <RequireAuth anyOf={['audit.view']}>
                <AuditPage />
              </RequireAuth>
            ),
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
