import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isSessionEnded } from './http';

/** Queries and mutations that use a session put its token here (`meta: sessionMeta(token)`). */
export const sessionMeta = (token: string) => ({ sessionToken: token });

/**
 * Any answer "this session has ended" (the table paid) is reported once, whichever call got
 * it. Requests are not retried and nothing refetches on focus: the screens decide when.
 */
export function createQueryClient(onSessionEnded: (token: string) => void): QueryClient {
  const report = (error: unknown, meta: Record<string, unknown> | undefined) => {
    if (isSessionEnded(error) && typeof meta?.sessionToken === 'string') {
      onSessionEnded(meta.sessionToken);
    }
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => report(error, query.meta) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => report(error, mutation.meta),
    }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}
