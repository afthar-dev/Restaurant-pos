import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export { menuKeys } from './keys';
export const AddonsPage = lazy(() =>
  import('./pages/AddonsPage').then((m) => ({ default: m.AddonsPage })),
);
export const AvailabilityPage = lazy(() =>
  import('./pages/AvailabilityPage').then((m) => ({ default: m.AvailabilityPage })),
);
export const MenuPage = lazy(() =>
  import('./pages/MenuPage').then((m) => ({ default: m.MenuPage })),
);
export { useMenu } from './queries';
export { FOOD_DOT, type Menu, type MenuAddonGroup, type MenuItem, type MenuVariant } from './types';
