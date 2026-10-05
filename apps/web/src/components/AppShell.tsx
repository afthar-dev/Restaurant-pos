import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { apiFetch } from '../auth/api';
import { useBootSession } from '../auth/hooks';
import { useSession } from '../auth/store';
import { visibleAreas } from '../pages/Home';
import { ServerStatus } from './ServerStatus';

function SignOutButton() {
  const clear = useSession((s) => s.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', skipRefresh: true });
    } catch {
      // Even if the server is unreachable, forget the session on this screen.
    }
    clear();
    queryClient.clear();
    navigate('/', { replace: true });
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="text-sm text-slate-600 underline"
    >
      Sign out
    </button>
  );
}

export function AppShell() {
  useBootSession();
  const user = useSession((s) => s.user);
  const permissions = useSession((s) => s.permissions);

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <nav className="flex flex-wrap items-center gap-4 text-sm font-medium">
          <NavLink to="/" className="font-semibold text-emerald-800">
            Restaurant POS
          </NavLink>
          {visibleAreas(permissions).map((area) => (
            <NavLink
              key={area.to}
              to={area.to}
              className={({ isActive }) =>
                isActive ? 'text-emerald-800 underline underline-offset-4' : 'text-slate-600'
              }
            >
              {area.short}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <ServerStatus />
          {user && (
            <>
              <span className="text-sm font-medium">{user.name}</span>
              <SignOutButton />
            </>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
