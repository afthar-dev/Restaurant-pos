import { lazy, type ComponentProps, type ComponentType } from 'react';
import type { ColumnChart as Chart } from '../charts/ColumnChart';

/**
 * Recharts is big: Home loads it after the card's text is on screen. If its code cannot load
 * (app updated, Wi-Fi dropped), the card keeps its text and goes without the chart, rather
 * than the error taking down the whole home screen. Render inside a Suspense boundary.
 */
export const LazyColumnChart = lazy<ComponentType<ComponentProps<typeof Chart>>>(() =>
  import('../charts/ColumnChart').catch(() => ({ default: () => null })),
);
