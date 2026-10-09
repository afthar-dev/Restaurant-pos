import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const openDay = (openedAt: string) => ({
  day: { id: 'd1', status: 'OPEN', openingCash: 0, openedAt, openedBy: { id: 'm', name: 'Meena' } },
});

function signIn() {
  useSession.getState().setSession(sessionBody('CASHIER', ['bill.print', 'expense.manage']));
}

describe('phone status button', () => {
  it('says all is well when the server answers and today is open', async () => {
    signIn();
    mockApi({
      'GET /api/health': () => json({ status: 'ok', db: 'up' }),
      'GET /api/business-day/current': () => json(openDay(new Date().toISOString())),
    });
    renderRoute('/expenses');
    const button = await screen.findByRole('button', { name: 'Status: All good' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).toHaveTextContent('Server online');
    expect(panel).toHaveTextContent(/Day open since/);
  });

  it('puts the worst problem on the button itself', async () => {
    signIn();
    mockApi({
      'GET /api/health': () => Promise.reject(new TypeError('Failed to fetch')),
      'GET /api/business-day/current': () => json({ day: null }),
    });
    renderRoute('/expenses');
    expect(await screen.findByRole('button', { name: 'Status: Offline' })).toBeInTheDocument();
  });

  it('flags a day that is not open', async () => {
    signIn();
    mockApi({
      'GET /api/health': () => json({ status: 'ok', db: 'up' }),
      'GET /api/business-day/current': () => json({ day: null }),
    });
    renderRoute('/expenses');
    expect(await screen.findByRole('button', { name: 'Status: Day not open' })).toBeInTheDocument();
  });

  it('flags a day left open from before', async () => {
    signIn();
    mockApi({
      'GET /api/health': () => json({ status: 'ok', db: 'up' }),
      'GET /api/business-day/current': () =>
        json(openDay(new Date(Date.now() - 30 * 3600_000).toISOString())),
    });
    renderRoute('/expenses');
    expect(await screen.findByRole('button', { name: 'Status: Old day open' })).toBeInTheDocument();
  });
});
