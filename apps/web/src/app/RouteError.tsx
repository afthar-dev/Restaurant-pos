import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Link, useRouteError } from 'react-router';
import { Button, EmptyState } from '@/shared/ui';

/** Chrome, Firefox and Safari word a failed lazy page download differently. */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|module script failed|error loading dynamically|Failed to fetch/i.test(
    message,
  );
}

/**
 * Shown in place of a screen that crashed or could not load, inside the app shell, so the
 * sidebar and the rest of the app keep working.
 */
export function RouteError() {
  const error = useRouteError();
  const reload = (
    <Button icon={<RefreshCw />} onClick={() => window.location.reload()}>
      Reload
    </Button>
  );

  if (isChunkLoadError(error)) {
    return (
      <EmptyState
        icon={<RefreshCw />}
        title="This screen could not load"
        description="The app was updated or the connection dropped. Reload to get the latest version. Open orders are safe on the server."
        action={reload}
      />
    );
  }

  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="Something went wrong on this screen"
      description="Reload to try again. If it keeps happening, tell the manager what you were doing."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {reload}
          <Button asChild variant="secondary">
            <Link to="/">Go to home</Link>
          </Button>
        </div>
      }
    />
  );
}
