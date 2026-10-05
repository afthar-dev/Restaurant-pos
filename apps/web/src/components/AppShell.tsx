import { NavLink, Outlet } from 'react-router';
import { ServerStatus } from './ServerStatus';

const areas = [
  { to: '/pos', label: 'POS' },
  { to: '/captain', label: 'Captain' },
  { to: '/kds', label: 'Kitchen' },
  { to: '/admin', label: 'Admin' },
];

export function AppShell() {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <nav className="flex flex-wrap items-center gap-4 text-sm font-medium">
          <NavLink to="/" className="font-semibold text-emerald-800">
            Restaurant POS
          </NavLink>
          {areas.map((area) => (
            <NavLink
              key={area.to}
              to={area.to}
              className={({ isActive }) =>
                isActive ? 'text-emerald-800 underline underline-offset-4' : 'text-slate-600'
              }
            >
              {area.label}
            </NavLink>
          ))}
        </nav>
        <ServerStatus />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
