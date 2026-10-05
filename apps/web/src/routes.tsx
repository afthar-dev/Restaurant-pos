import type { RouteObject } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { AreaPlaceholder } from './pages/AreaPlaceholder';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { CaptainPage } from './pages/CaptainPage';
import { PosPage } from './pages/PosPage';
import { ADMIN_PERMISSIONS, Home } from './pages/Home';
import { LoginPage } from './pages/LoginPage';
import { NotFound } from './pages/NotFound';
import { PinPage } from './pages/PinPage';
import { AddonsPage } from './pages/admin/AddonsPage';
import { AdminIndex, AdminLayout } from './pages/admin/AdminLayout';
import { MenuPage } from './pages/admin/MenuPage';
import { AuditPage } from './pages/admin/AuditPage';
import { DevicesPage } from './pages/admin/DevicesPage';
import { KitchenPage } from './pages/admin/KitchenPage';
import { TablesPage } from './pages/admin/TablesPage';
import { TaxPage } from './pages/admin/TaxPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { StaffPage } from './pages/admin/StaffPage';

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
        path: 'kds',
        element: (
          <AreaPlaceholder
            title="Kitchen display"
            description="Live kitchen order tickets with preparing and ready states arrive in milestone M2."
          />
        ),
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
