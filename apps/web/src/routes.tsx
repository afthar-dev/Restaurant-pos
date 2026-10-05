import type { RouteObject } from 'react-router';
import { AppShell } from './components/AppShell';
import { AreaPlaceholder } from './pages/AreaPlaceholder';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 'pos',
        element: (
          <AreaPlaceholder
            title="POS counter"
            description="Table orders, parcel orders, billing and payments arrive in milestones M2 and M3."
          />
        ),
      },
      {
        path: 'captain',
        element: (
          <AreaPlaceholder
            title="Captain app"
            description="Waiters will take table orders and send KOTs from their phones in milestone M2."
          />
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
          <AreaPlaceholder
            title="Admin"
            description="Menu and tables arrive in M1; stock, expenses and reports in M5."
          />
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
