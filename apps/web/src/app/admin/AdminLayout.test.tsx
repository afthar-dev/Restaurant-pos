import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

describe('AdminLayout back link', () => {
  it('offers the way back to the setup guide only when opened from it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['devices.manage'], 'Asha'));
    mockApi({ 'GET /api/devices': () => json([]) });
    const first = renderRoute('/admin/devices?from=setup');
    expect(await screen.findByRole('link', { name: 'Back to setup guide' })).toHaveAttribute(
      'href',
      '/setup',
    );
    first.unmount();
    renderRoute('/admin/devices');
    await screen.findByRole('heading', { level: 1, name: 'Admin' });
    expect(screen.queryByRole('link', { name: 'Back to setup guide' })).toBeNull();
  });
});
