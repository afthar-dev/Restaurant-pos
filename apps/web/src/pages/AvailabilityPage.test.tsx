import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '../auth/store';
import { callsTo, json, mockApi, sessionBody } from '../test/mock-api';
import { renderRoute } from '../test/render';

const item = (id: string, name: string, isAvailable = true) => ({
  id,
  categoryId: 'c1',
  name,
  description: null,
  foodType: 'VEG',
  isAvailable,
  isCombo: false,
  taxRate: { id: 't', name: 'GST 5%', cgstBp: 250, sgstBp: 250 },
  variants: [
    { id: `${id}-v`, name: 'Regular', dineInPrice: 10000, parcelPrice: 10000, packagingCharge: 0 },
  ],
  addonGroups: [],
  components: [],
});

const menu = {
  categories: [
    {
      id: 'c1',
      name: 'Starters',
      sortOrder: 0,
      station: { id: 's', name: 'Kitchen' },
      items: [item('i1', 'Paneer Tikka'), item('i2', 'Veg Soup', false)],
    },
  ],
};

function asWaiter() {
  useSession.getState().setSession(sessionBody('WAITER', ['order.take', 'menu.availability']));
}

describe('AvailabilityPage', () => {
  it('marks an item out of stock', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/menu': () => json(menu),
      'PATCH /api/menu/items/i1/availability': () => json({ id: 'i1', isAvailable: false }),
    });
    renderRoute('/availability');
    const toggle = await screen.findByRole('switch', { name: 'Paneer Tikka available' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Veg Soup available' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect
      .poll(() => callsTo(mock, 'PATCH', '/api/menu/items/i1/availability').length)
      .toBe(1);
    const [call] = callsTo(mock, 'PATCH', '/api/menu/items/i1/availability');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ isAvailable: false });
  });

  it('puts the switch back and explains when saving fails', async () => {
    asWaiter();
    mockApi({
      'GET /api/menu': () => json(menu),
      'PATCH /api/menu/items/i1/availability': () => json({ code: 'X', message: 'boom' }, 500),
    });
    renderRoute('/availability');
    const toggle = await screen.findByRole('switch', { name: 'Paneer Tikka available' });
    fireEvent.click(toggle);
    expect(
      await screen.findByText('Could not update Paneer Tikka. Try again.'),
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('filters by name', async () => {
    asWaiter();
    mockApi({ 'GET /api/menu': () => json(menu) });
    renderRoute('/availability');
    await screen.findByText('Paneer Tikka');
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'soup' } });
    expect(screen.queryByText('Paneer Tikka')).toBeNull();
    expect(screen.getByText('Veg Soup')).toBeInTheDocument();
  });
});
