/** One bar or point on a chart. */
export interface ChartPoint {
  key: string;
  /** Axis label; empty for labels thinned out. */
  label: string;
  /** Paise. */
  value: number;
  /** Tooltip and screen-reader text, e.g. "Sat 10 Oct · ₹18,250 · 42 bills". */
  detail: string;
  /** Drawn darker: the best day, or today on the home card. */
  highlight?: boolean;
}
