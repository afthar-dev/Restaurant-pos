import { qrFetch } from '@/shared/api/http';
import type { StoredSession } from './storage';

/** Opens a session for the table whose sticker was scanned. */
export async function startSession(code: string): Promise<StoredSession> {
  const started = await qrFetch<{
    token: string;
    table: { name: string };
    outlet: { name: string; logoUrl?: string | null };
  }>('/api/qr/sessions', { method: 'POST', body: { code } });
  return {
    token: started.token,
    table: started.table.name,
    outlet: started.outlet.name,
    logoUrl: started.outlet.logoUrl ?? null,
  };
}
