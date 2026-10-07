import { Link } from 'react-router';
import { useSession } from '@/shared/session/store';
import { visibleNav } from './navigation';

export function Home() {
  const permissions = useSession((s) => s.permissions);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Restaurant POS</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleNav(permissions)
          .filter((n) => n.to !== '/')
          .map((area) => (
            <Link
              key={area.to}
              to={area.to}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 hover:border-primary-600"
            >
              <span className="font-semibold">{area.title}</span>
              <span className="text-sm text-muted">{area.description}</span>
            </Link>
          ))}
      </div>
    </section>
  );
}
