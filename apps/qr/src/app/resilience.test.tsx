import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { qrFetch, QrApiError } from '@/shared/api/http';
import { App } from './App';
import { callsTo, json, mockApi } from '@/test/mock';

const CODE = 'c'.repeat(43);

const MENU = {
  categories: [
    {
      id: 'breads',
      name: 'Breads',
      items: [
        {
          id: 'roti',
          name: 'Tandoori Roti',
          description: null,
          foodType: 'VEG',
          variants: [{ id: 'roti-r', name: 'Regular', price: 3000 }],
          addonGroups: [],
        },
        {
          id: 'naan',
          name: 'Butter Naan',
          description: null,
          foodType: 'VEG',
          variants: [{ id: 'naan-r', name: 'Regular', price: 5000 }],
          addonGroups: [],
        },
      ],
    },
  ],
};

const started = () =>
  json({ token: 'session-1', table: { name: 'T1' }, outlet: { name: 'Spice Garden' } }, 201);

async function add(name: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(within(sheet).getByRole('button', { name: /^Add/ }));
}

afterEach(() => vi.useRealTimers());

describe('weak connections', () => {
  it('gives up on a request that hangs, so the diner can try again', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const pending = qrFetch('/api/qr/menu').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(16_000);
    const error = await pending;
    expect(error).toBeInstanceOf(QrApiError);
    expect((error as QrApiError).code).toBe('OFFLINE');
  });

  it('treats a changed cart as a new order after a send whose reply was lost', async () => {
    let attempt = 0;
    const mock = mockApi({
      'POST /api/qr/sessions': started,
      'GET /api/qr/menu': () => json(MENU),
      'GET /api/qr/orders': () => json([]),
      'POST /api/qr/orders': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return json(
          {
            id: 's1',
            status: 'PENDING',
            message: 'Waiting for the staff to confirm',
            lines: [],
            note: null,
            total: 8000,
            createdAt: new Date().toISOString(),
          },
          201,
        );
      },
    });
    render(<App search={`?t=${CODE}`} />);
    await add(/^Tandoori Roti/);
    fireEvent.click(await screen.findByRole('button', { name: /^Your order/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to the staff' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // The diner checks the menu again and adds a naan before retrying.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await add(/^Butter Naan/);
    fireEvent.click(screen.getByRole('button', { name: /^Your order/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to the staff' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/qr/orders').length).toBe(2);
    const keys = callsTo(mock, 'POST', '/api/qr/orders').map(([, init]) =>
      new Headers(init?.headers).get('Idempotency-Key'),
    );
    expect(keys[0]).not.toBe(keys[1]);
    // After the failed send the phone checks whether the first order got through.
    expect(callsTo(mock, 'GET', '/api/qr/orders').length).toBeGreaterThanOrEqual(2);
  });

  it('lets the diner try again when the table could not be opened', async () => {
    let up = false;
    mockApi({
      'POST /api/qr/sessions': () => {
        if (!up) throw new TypeError('Failed to fetch');
        return started();
      },
      'GET /api/qr/menu': () => json(MENU),
      'GET /api/qr/orders': () => json([]),
    });
    render(<App search={`?t=${CODE}`} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    up = true;
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(await screen.findByRole('button', { name: /^Tandoori Roti/ })).toBeInTheDocument();
  });

  it('lets the diner reload a menu that failed to load', async () => {
    let up = false;
    mockApi({
      'POST /api/qr/sessions': started,
      'GET /api/qr/menu': () => {
        if (!up) throw new TypeError('Failed to fetch');
        return json(MENU);
      },
      'GET /api/qr/orders': () => json([]),
    });
    render(<App search={`?t=${CODE}`} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    up = true;
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: /^Tandoori Roti/ })).toBeInTheDocument();
  });
});
