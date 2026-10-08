import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { ChartFrame } from './ChartFrame';
import { niceMax, shortRupees } from './scale';

export interface Bar {
  key: string;
  /** Axis label; empty for bars whose label is thinned out. */
  label: string;
  /** Paise. */
  value: number;
  /** Tooltip and accessible name, e.g. "Sat 10 Oct · ₹18,250 · 42 bills". */
  detail: string;
  highlight?: boolean;
}

const GRID = [1 / 3, 2 / 3, 1];

/**
 * Vertical bars anchored to the baseline. One Tab stop: arrow keys move between bars, each
 * bar shows its detail on hover or focus. `compact` drops the axes for small cards.
 */
export function BarChart({
  title,
  takeaway,
  bars,
  height = 176,
  compact = false,
  as,
}: {
  title: string;
  takeaway: string;
  bars: Bar[];
  height?: number;
  compact?: boolean;
  as?: 'h2' | 'h3';
}) {
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState<number | null>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)));
  // The bars can shrink (another range picked): keep one of them the Tab stop.
  const current = Math.min(active, Math.max(0, bars.length - 1));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setShown(null);
      return;
    }
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = Math.min(bars.length - 1, Math.max(0, current + step));
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <ChartFrame title={title} takeaway={takeaway} as={as}>
      <div className="flex gap-2">
        {!compact && (
          <div
            aria-hidden="true"
            className="relative w-11 shrink-0 text-right text-xs text-subtle tabular-nums"
            style={{ height }}
          >
            {GRID.map((f) => (
              <span
                key={f}
                className="absolute right-0 translate-y-1/2"
                style={{ bottom: `${f * 100}%` }}
              >
                {shortRupees(max * f)}
              </span>
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="relative" style={{ height }}>
            {!compact &&
              GRID.map((f) => (
                <div
                  key={f}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-border"
                  style={{ bottom: `${f * 100}%` }}
                />
              ))}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 border-t border-border-strong"
            />
            <div
              role="group"
              aria-label={`${title}. ${takeaway}`}
              onKeyDown={onKeyDown}
              className="absolute inset-0 flex items-end gap-0.5"
            >
              {bars.map((bar, i) => (
                <div
                  key={bar.key}
                  ref={(node) => {
                    refs.current[i] = node;
                  }}
                  role="img"
                  aria-label={bar.detail}
                  tabIndex={i === current ? 0 : -1}
                  onFocus={() => {
                    setActive(i);
                    setShown(i);
                  }}
                  onBlur={() => setShown(null)}
                  onMouseEnter={() => setShown(i)}
                  onMouseLeave={() => setShown(null)}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                  <div
                    data-bar-fill
                    className={cn(
                      'w-full max-w-10 rounded-t transition-colors group-hover:bg-primary-800',
                      // 600 keeps 3:1 against white; today on the home chart is darker still.
                      bar.highlight ? 'bg-primary-800' : 'bg-primary-600',
                    )}
                    style={{ height: max === 0 ? '0%' : `${Math.round((bar.value / max) * 100)}%` }}
                  />
                  {shown === i && (
                    <div
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-56 rounded-md bg-text px-2 py-1 text-xs text-surface shadow-overlay',
                        // Edge bars open their tooltip inwards so it stays on screen.
                        i < bars.length / 3
                          ? 'left-0'
                          : i >= (bars.length * 2) / 3
                            ? 'right-0'
                            : '',
                      )}
                    >
                      {bar.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {!compact && (
            <div aria-hidden="true" className="flex h-4 gap-0.5 text-xs text-subtle">
              {bars.map((bar, i) => (
                // Thinned labels may spill over the empty slots beside them.
                <span key={bar.key} className="relative min-w-0 flex-1">
                  {bar.label && (
                    <span
                      className={cn(
                        'absolute top-0 whitespace-nowrap',
                        i === 0
                          ? 'left-0'
                          : i === bars.length - 1
                            ? 'right-0'
                            : 'left-1/2 -translate-x-1/2',
                      )}
                    >
                      {bar.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </ChartFrame>
  );
}
