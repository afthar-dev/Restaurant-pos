import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RouteError } from './RouteError';

function renderCrash(message: string) {
  function Crash(): never {
    throw new TypeError(message);
  }
  const router = createMemoryRouter([
    { path: '/', element: <Crash />, errorElement: <RouteError /> },
  ]);
  render(<RouterProvider router={router} />);
}

describe('RouteError', () => {
  it('offers a reload when a screen could not be downloaded', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderCrash('Failed to fetch dynamically imported module: /assets/StockPage-x.js');
    expect(screen.getByText('This screen could not load')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('offers reload and home when a screen crashed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderCrash('Cannot read properties of undefined');
    expect(screen.getByText('Something went wrong on this screen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/');
  });
});
