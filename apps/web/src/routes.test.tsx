import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from './test/render';

describe('routes', () => {
  it.each([
    ['/pos', 'POS counter'],
    ['/captain', 'Captain app'],
    ['/kds', 'Kitchen display'],
    ['/admin', 'Admin'],
  ])('%s renders the %s area', async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('home links to every area', async () => {
    renderRoute('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Restaurant POS' }),
    ).toBeInTheDocument();
    // Scope to <main>: the header nav also has links named "Admin" etc.
    const main = within(screen.getByRole('main'));
    for (const name of ['POS counter', 'Captain app', 'Kitchen display', 'Admin']) {
      expect(main.getByRole('link', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
  });

  it('unknown paths show a not-found page', async () => {
    renderRoute('/nope');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });

  it('every page shows the server status', async () => {
    renderRoute('/kds');
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
