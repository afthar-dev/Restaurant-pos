import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import {
  addCategory,
  archiveAddonGroup,
  archiveCategory,
  archiveItem,
  bulkPrices,
  reorderCategories,
  reorderItems,
  saveAddonGroup,
  saveItem,
  setAddonAvailability,
  setItemAvailability,
  updateCategory,
} from './api';
import { menuKeys } from './keys';
import type { Menu, MenuAddon, MenuAddonGroup, MenuCategory, MenuItem } from './types';

export const useAddCategory = (onAdded: () => void) =>
  useInvalidatingMutation({
    mutationFn: addCategory,
    invalidates: [menuKeys.all],
    onSuccess: onAdded,
  });

export const useUpdateCategory = (category: MenuCategory, onSaved: () => void) =>
  useInvalidatingMutation({
    mutationFn: (body: object) => updateCategory(category, body),
    invalidates: [menuKeys.all],
    onSuccess: onSaved,
    afterRefresh: true,
  });

export type MenuEntry =
  { kind: 'item'; item: MenuItem } | { kind: 'category'; category: MenuCategory };

/** Archives a dish or a whole category. */
export const useArchiveMenuEntry = (onArchived: () => void) =>
  useInvalidatingMutation({
    mutationFn: (entry: MenuEntry) =>
      entry.kind === 'item' ? archiveItem(entry.item) : archiveCategory(entry.category),
    invalidates: [menuKeys.all],
    onSuccess: onArchived,
  });

export const useSaveItem = (existing: MenuItem | null, onSaved: () => void) =>
  useInvalidatingMutation({
    mutationFn: (body: object) => saveItem(existing, body),
    invalidates: [menuKeys.all],
    onSuccess: onSaved,
    afterRefresh: true,
  });

/** Add-on groups appear on dishes too, so the menu refreshes with them. */
export const useSaveAddonGroup = (existing: MenuAddonGroup | null, onSaved: () => void) =>
  useInvalidatingMutation({
    mutationFn: (body: object) => saveAddonGroup(existing, body),
    invalidates: [menuKeys.addonGroups, menuKeys.all],
    onSuccess: onSaved,
    afterRefresh: true,
  });

export const useArchiveAddonGroup = (onArchived: () => void) =>
  useInvalidatingMutation({
    mutationFn: archiveAddonGroup,
    invalidates: [menuKeys.addonGroups, menuKeys.all],
    onSuccess: onArchived,
  });

type MenuPatch = (menu: Menu) => Menu;

function usePatchMenu() {
  const client = useQueryClient();
  return (patch: MenuPatch) =>
    client.setQueryData<Menu>(menuKeys.all, (old) => (old ? patch(old) : old));
}

const withItem =
  (id: string, isAvailable: boolean): MenuPatch =>
  (menu) => ({
    categories: menu.categories.map((c) => ({
      ...c,
      items: c.items.map((i) => (i.id === id ? { ...i, isAvailable } : i)),
    })),
  });

const withAddon =
  (id: string, isAvailable: boolean): MenuPatch =>
  (menu) => ({
    categories: menu.categories.map((c) => ({
      ...c,
      items: c.items.map((i) => ({
        ...i,
        addonGroups: i.addonGroups.map((g) => ({
          ...g,
          addons: g.addons.map((a) => (a.id === id ? { ...a, isAvailable } : a)),
        })),
      })),
    })),
  });

interface ToggleHandlers {
  onStart: () => void;
  onFailed: (name: string) => void;
}

/** Flips a dish in or out of stock at once; puts it back if the server refuses. */
export function useToggleItem({ onStart, onFailed }: ToggleHandlers) {
  const patch = usePatchMenu();
  return useMutation({
    mutationFn: (item: MenuItem) => setItemAvailability(item, !item.isAvailable),
    onMutate: (item) => {
      onStart();
      patch(withItem(item.id, !item.isAvailable));
    },
    onError: (_error, item) => {
      patch(withItem(item.id, item.isAvailable));
      onFailed(item.name);
    },
  });
}

/** Same for an add-on, everywhere it appears. */
export function useToggleAddon({ onStart, onFailed }: ToggleHandlers) {
  const patch = usePatchMenu();
  return useMutation({
    mutationFn: (addon: MenuAddon) => setAddonAvailability(addon, !addon.isAvailable),
    onMutate: (addon) => {
      onStart();
      patch(withAddon(addon.id, !addon.isAvailable));
    },
    onError: (_error, addon) => {
      patch(withAddon(addon.id, addon.isAvailable));
      onFailed(addon.name);
    },
  });
}

/** Bulk price change; the menu refreshes before `onDone` so the new prices show at once. */
export const useBulkPrices = (onDone: (result: { updated: number }) => void) =>
  useInvalidatingMutation({
    mutationFn: bulkPrices,
    invalidates: [menuKeys.all],
    onSuccess: onDone,
    afterRefresh: true,
  });

export type Reorder =
  { kind: 'categories'; ids: string[] } | { kind: 'items'; categoryId: string; ids: string[] };

const pick = <T extends { id: string }>(rows: T[], ids: string[]) =>
  ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is T => r !== undefined);

const inOrder =
  (move: Reorder): MenuPatch =>
  (menu) =>
    move.kind === 'categories'
      ? { categories: pick(menu.categories, move.ids) }
      : {
          categories: menu.categories.map((c) =>
            c.id === move.categoryId ? { ...c, items: pick(c.items, move.ids) } : c,
          ),
        };

/** Shows the new order at once; a refusal brings the server's order back. */
export function useReorder(onFailed: (error: Error) => void) {
  const client = useQueryClient();
  const patch = usePatchMenu();
  return useMutation({
    // One save at a time, in the order the moves were made, so the last move wins.
    scope: { id: 'menu-order' },
    mutationFn: (move: Reorder) =>
      move.kind === 'categories'
        ? reorderCategories(move.ids)
        : reorderItems(move.categoryId, move.ids),
    onMutate: async (move) => {
      // A refetch landing now would undo the new order on screen.
      await client.cancelQueries({ queryKey: menuKeys.all });
      const before = client.getQueryData<Menu>(menuKeys.all);
      patch(inOrder(move));
      return { before };
    },
    onError: (error, _move, context) => {
      // Back to the order the server still has, even if the refetch below cannot reach it.
      if (context?.before) client.setQueryData(menuKeys.all, context.before);
      onFailed(error);
    },
    onSettled: () => client.invalidateQueries({ queryKey: menuKeys.all }),
  });
}
