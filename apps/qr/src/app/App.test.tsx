import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('QR App', () => {
  it('asks the customer to scan when no table token is present', () => {
    render(<App search="" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Scan to order' })).toBeInTheDocument();
    expect(screen.getByText('Scan the QR code on your table to see the menu.')).toBeInTheDocument();
  });

  it('treats a blank token as missing', () => {
    render(<App search="?t=%20%20" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Scan to order' })).toBeInTheDocument();
  });

  it('opens the table menu when a token is present', () => {
    render(<App search="?t=abc123" />);
    expect(screen.getByRole('status', { name: 'Loading the menu' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Scan to order' })).toBeNull();
  });
});
