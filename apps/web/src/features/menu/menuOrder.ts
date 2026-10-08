import type { MenuCategory } from './types';

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Dishes whose name or a size name contains the query, kept in their categories. */
export function filterMenu(categories: MenuCategory[], query: string): MenuCategory[] {
  const q = tidy(query);
  if (!q) return categories;
  return categories
    .map((c) => ({
      ...c,
      items: c.items.filter(
        (i) => tidy(i.name).includes(q) || i.variants.some((v) => tidy(v.name).includes(q)),
      ),
    }))
    .filter((c) => c.items.length > 0);
}

/** `from` moved to where `to` is (a drag ending over another row). */
export function moveId(ids: string[], from: string, to: string): string[] {
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0 || a === b) return ids;
  const next = [...ids];
  next.splice(a, 1);
  next.splice(b, 0, from);
  return next;
}

/** One step up (-1) or down (1); unchanged at the ends. */
export function moveBy(ids: string[], id: string, step: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  return moveId(ids, id, ids[j]!);
}
