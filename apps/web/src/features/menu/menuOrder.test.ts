import { describe, expect, it } from 'vitest';
import { filterMenu, moveBy, moveId } from './menuOrder';
import type { MenuCategory } from './types';

const cat = (name: string, items: { name: string; sizes?: string[] }[]) =>
  ({
    id: name,
    name,
    items: items.map((i) => ({
      id: i.name,
      name: i.name,
      variants: (i.sizes ?? ['Regular']).map((v) => ({ id: `${i.name}-${v}`, name: v })),
    })),
  }) as unknown as MenuCategory;

describe('filterMenu', () => {
  const menu = [
    cat('Starters', [{ name: 'Paneer Tikka' }, { name: 'Aloo Tikki' }]),
    cat('Mains', [{ name: 'Kadai Paneer' }, { name: 'Dal', sizes: ['Half', 'Full'] }]),
  ];

  it('keeps matching dishes in their categories, ignoring case and extra spaces', () => {
    expect(filterMenu(menu, '  PANEER ').map((c) => [c.name, c.items.map((i) => i.name)])).toEqual([
      ['Starters', ['Paneer Tikka']],
      ['Mains', ['Kadai Paneer']],
    ]);
  });

  it('matches size names and drops empty categories', () => {
    expect(filterMenu(menu, 'half').map((c) => c.name)).toEqual(['Mains']);
    expect(filterMenu(menu, 'pizza')).toEqual([]);
    expect(filterMenu(menu, '   ')).toBe(menu);
  });
});

describe('moving ids', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('moves an id to where another one is', () => {
    expect(moveId(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveId(ids, 'a', 'a')).toBe(ids);
  });
  it('moves one step up or down, staying put at the ends', () => {
    expect(moveBy(ids, 'b', -1)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveBy(ids, 'b', 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveBy(ids, 'a', -1)).toBe(ids);
    expect(moveBy(ids, 'd', 1)).toBe(ids);
  });
});
