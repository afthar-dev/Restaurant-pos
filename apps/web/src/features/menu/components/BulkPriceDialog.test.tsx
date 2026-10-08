import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { expectNoAxeViolations } from '@/test/a11y';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import type { MenuCategory } from '../types';
import { BulkPriceDialog } from './BulkPriceDialog';

const item = (id: string, name: string, variants: [string, number, number][]) => ({
  id,
  name,
  categoryId: 'c1',
  variants: variants.map(([vName, dineInPrice, parcelPrice], i) => ({
    id: `${id}-${i}`,
    name: vName,
    dineInPrice,
    parcelPrice,
    packagingCharge: 0,
  })),
});

const CATEGORIES = [
  {
    id: 'c1',
    name: 'Starters',
    items: [
      item('00000000-0000-4000-8000-0000000000a1', 'Paneer Tikka', [
        ['Half', 18000, 18000],
        ['Full', 32000, 33000],
      ]),
    ],
  },
  {
    id: 'c2',
    name: 'Breads',
    items: [item('00000000-0000-4000-8000-0000000000b1', 'Roti', [['Regular', 2000, 2000]])],
  },
] as unknown as MenuCategory[];

function open(handlers = {}) {
  useSession.getState().setSession(sessionBody('MANAGER', ['menu.manage']));
  const mock = mockApi(handlers);
  const onClose = vi.fn();
  renderWithProviders(<BulkPriceDialog categories={CATEGORIES} onClose={onClose} />);
  return { mock, onClose };
}

describe('BulkPriceDialog', () => {
  it('previews every changed price for the whole menu', () => {
    open();
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Round to'), { target: { value: '500' } });
    // Roti ₹20 + 5% = ₹21, which rounds back to ₹20: unchanged, so not listed.
    expect(screen.getByText('2 prices will change')).toBeInTheDocument();
    const preview = within(screen.getByRole('table', { name: 'New prices' }));
    expect(preview.getByRole('row', { name: /Paneer Tikka Full/ })).toHaveTextContent(
      'Paneer Tikka Full₹320 → ₹335₹330 → ₹345',
    );
    expect(preview.queryByRole('row', { name: /Roti/ })).toBeNull();
  });

  it('limits the change to one category and saves it', async () => {
    const { mock, onClose } = open({
      'POST /api/menu/prices': () => json({ updated: 1 }, 201),
      'GET /api/menu': () => json({ categories: [] }),
    });
    fireEvent.click(screen.getByLabelText('One category'));
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'c2' } });
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'up-rupees' } });
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update 1 price' }));
    await expect.poll(() => onClose.mock.calls.length).toBe(1);
    expect(JSON.parse(String(callsTo(mock, 'POST', '/api/menu/prices')[0]![1]!.body))).toEqual({
      itemIds: ['00000000-0000-4000-8000-0000000000b1'],
      change: { kind: 'amount', paise: 200 },
      roundTo: 100,
    });
  });

  it('will not save a decrease that takes a price below ₹0', () => {
    open();
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'down-rupees' } });
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '50' } });
    expect(
      screen.getByText('Some prices would go below ₹0. Choose a smaller decrease.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Update/ })).toBeDisabled();
  });

  it('picks single dishes', () => {
    open();
    fireEvent.click(screen.getByLabelText('Pick dishes'));
    fireEvent.change(screen.getByLabelText('Find a dish'), { target: { value: 'rot' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Roti Breads' }));
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '10' } });
    expect(screen.getByText('1 price will change')).toBeInTheDocument();
  });

  it('says what the server would refuse before saving', () => {
    open();
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'down-percent' } });
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '100' } });
    expect(screen.getByText('A change can be from -90% to +200%.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Update/ })).toBeDisabled();
  });

  it('has no accessibility problems', async () => {
    open();
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '5' } });
    await expectNoAxeViolations();
  });
});
