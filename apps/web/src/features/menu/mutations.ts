import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import {
  addCategory,
  archiveAddonGroup,
  archiveCategory,
  archiveItem,
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
