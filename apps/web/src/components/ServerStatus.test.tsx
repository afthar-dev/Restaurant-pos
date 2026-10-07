import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ServerStatus } from './ServerStatus';

function stubFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ServerStatus', () => {
  it('shows a checking state while waiting', () => {
    renderWithProviders(<ServerStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking server…');
  });

  it('shows online when the API and database are up', async () => {
    stubFetch(async () => json({ status: 'ok', db: 'up' }));
    renderWithProviders(<ServerStatus />);
    expect(await screen.findByText('Server online')).toBeInTheDocument();
  });

  it('shows database unavailable on a 503 with db down', async () => {
    stubFetch(async () => json({ status: 'error', db: 'down' }, 503));
    renderWithProviders(<ServerStatus />);
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  it('shows offline when the network request fails', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    renderWithProviders(<ServerStatus />);
    expect(
      await screen.findByText('Server offline. Check the internet connection.'),
    ).toBeInTheDocument();
  });

  it('still checks, and shows offline, when the device reports no network', async () => {
    onlineManager.setOnline(false);
    try {
      stubFetch(async () => {
        throw new TypeError('Failed to fetch');
      });
      renderWithProviders(<ServerStatus />);
      expect(
        await screen.findByText('Server offline. Check the internet connection.'),
      ).toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('shows offline when the response is not the expected shape', async () => {
    stubFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    renderWithProviders(<ServerStatus />);
    expect(
      await screen.findByText('Server offline. Check the internet connection.'),
    ).toBeInTheDocument();
  });
});
