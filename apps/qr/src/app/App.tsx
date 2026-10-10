import { QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useSession, useStartSession } from '@/features/session';
import { QrApiError } from '@/shared/api/http';
import { createQueryClient } from '@/shared/api/queryClient';
import { MenuSkeleton } from '@/features/menu';
import { button, Notice } from '@/shared/ui';
import { CircleAlert, QrCode, RotateCcw } from 'lucide-react';
import { Ordering } from './Ordering';
import { shell } from './shell';

function readTableToken(search: string): string | null {
  const token = new URLSearchParams(search).get('t')?.trim();
  return token ? token : null;
}

export function App({ search }: { search: string }) {
  const [client] = useState(() => createQueryClient((token) => useSession.getState().end(token)));
  const code = readTableToken(search);
  return (
    <QueryClientProvider client={client}>
      {code ? (
        <TableScreen code={code} />
      ) : (
        <main className={shell}>
          <Notice icon={QrCode} title="Scan to order">
            Scan the QR code on your table to see the menu.
          </Notice>
        </main>
      )}
    </QueryClientProvider>
  );
}

/** Opens (or picks up) this phone's session for the table, then shows the menu. */
function TableScreen({ code }: { code: string }) {
  const session = useSession((s) => (s.code === code ? s.session : null));
  const ended = useSession((s) => s.code === code && s.ended);
  const restore = useSession((s) => s.restore);
  const start = useStartSession(code);
  const { mutate: startSession } = start;

  const begin = useCallback(
    (fresh: boolean) => {
      if (!fresh && restore(code)) return;
      startSession();
    },
    [code, restore, startSession],
  );

  useEffect(() => {
    begin(false);
  }, [begin]);

  if (session) return <Ordering session={session} />;
  // A restart that is running or failed shows like the first start, not the ended screen.
  if (start.isPending) return <Opening />;
  if (start.isError) {
    // An unknown sticker will not start working by trying again.
    const unknown = start.error instanceof QrApiError && start.error.code === 'QR_UNKNOWN';
    return (
      <main className={shell}>
        <Notice
          icon={CircleAlert}
          title="Sorry"
          action={
            !unknown && (
              <button
                type="button"
                className={`${button} w-full bg-primary-700 text-white`}
                onClick={() => begin(false)}
              >
                Try again
              </button>
            )
          }
        >
          {start.error.message || 'Please call the waiter.'}
        </Notice>
      </main>
    );
  }
  if (ended) {
    return (
      <main className={shell}>
        <Notice
          icon={RotateCcw}
          title="Welcome back"
          action={
            <button
              type="button"
              className={`${button} w-full bg-primary-700 text-white`}
              onClick={() => begin(true)}
            >
              Start again
            </button>
          }
        >
          Your table was closed. Scan the table QR again.
        </Notice>
      </main>
    );
  }
  return <Opening />;
}

function Opening() {
  return (
    <main className={shell}>
      <MenuSkeleton />
    </main>
  );
}
