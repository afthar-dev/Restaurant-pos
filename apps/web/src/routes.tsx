import type { RouteObject } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { AreaPlaceholder } from './pages/AreaPlaceholder';
import { ADMIN_PERMISSIONS, Home } from './pages/Home';
import { LoginPage } from './pages/LoginPage';
import { NotFound } from './pages/NotFound';
import { PinPage } from './pages/PinPage';

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
            <AreaPlaceholder
              title="POS counter"
              description="Table orders, parcel orders, billing and payments arrive in milestones M2 and M3."
            />
          </RequireAuth>
        ),
      },
      {
        path: 'captain',
        element: (
          <RequireAuth anyOf={['order.take']}>
            <AreaPlaceholder
              title="Captain app"
              description="Waiters will take table orders and send KOTs from their phones in milestone M2."
            />
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
            <AreaPlaceholder
              title="Admin"
              description="Staff, devices, settings and audit screens arrive in the next step."
            />
          </RequireAuth>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
