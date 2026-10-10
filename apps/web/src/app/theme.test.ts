import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Reads the app's colour tokens (and Tailwind's palette they build on) and checks that the text
 * and background pairs the screens use stay readable in the light and the dark appearance.
 */
// Vitest runs from apps/web; jsdom gives import.meta.url a non-file scheme.
const css = readFileSync(join(process.cwd(), '../../packages/shared/theme/tokens.css'), 'utf8');
const tw = readFileSync(
  createRequire(join(process.cwd(), 'package.json')).resolve('tailwindcss/theme.css'),
  'utf8',
);

/** Custom properties declared in a CSS block (first declaration wins). */
function vars(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (!out.has(m[1]!)) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

/** The text from a marker to the end of its first rule. */
function block(marker: string): string {
  const at = css.indexOf(marker);
  if (at < 0) throw new Error(`missing block ${marker}`);
  return css.slice(at, css.indexOf('\n}', at));
}

const base = vars(tw);
const light = new Map([...base, ...vars(css.slice(0, css.indexOf('/* dark appearance')))]);
const dark = new Map([...light, ...vars(block('/* dark appearance'))]);
// The kitchen display forces dark with its own copy of the declarations.
const kitchen = new Map([...light, ...vars(block("[data-theme='dark'] {"))]);

type Rgb = [number, number, number];

function srgb(value: string, table: Map<string, string>): Rgb {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) return srgb(table.get(ref[1]!)!, table);
  if (value.startsWith('#')) {
    const h = value.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
  }
  const m = value.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`cannot read colour ${value}`);
  const L = Number(m[1]) / 100;
  const C = Number(m[2]);
  const H = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  return linear.map((c) =>
    Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)),
  ) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg: string, bg: string, table: Map<string, string>): number {
  const x = luminance(srgb(table.get(fg) ?? fg, table));
  const y = luminance(srgb(table.get(bg) ?? bg, table));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Text pairs the screens use: [text, background, minimum ratio]. */
const PAIRS: [string, string, number][] = [
  ['color-text', 'color-surface', 4.5],
  ['color-muted', 'color-surface', 4.5],
  ['color-subtle', 'color-surface', 4.5],
  ['color-muted', 'color-bg', 4.5],
  ['color-primary-800', 'color-surface', 4.5],
  ['color-primary-800', 'color-primary-50', 4.5],
  ['color-red-700', 'color-surface', 4.5],
  ['color-red-700', 'color-red-50', 4.5],
  ['color-red-900', 'color-red-50', 4.5],
  ['color-green-800', 'color-surface', 4.5],
  ['color-green-800', 'color-green-50', 4.5],
  ['color-amber-900', 'color-amber-50', 4.5],
  ['color-amber-950', 'color-amber-50', 4.5],
  ['color-on-warning', 'color-warning-solid', 4.5],
  ['color-violet-900', 'color-violet-50', 4.5],
  ['color-sky-800', 'color-sky-50', 4.5],
  ['#ffffff', 'color-primary-700', 4.5],
  ['#ffffff', 'color-danger-solid', 4.5],
  ['#ffffff', 'color-success-solid', 4.5],
  // Chart bars and the food marks are graphical objects: 3:1 against the surface.
  ['color-muted', 'color-surface-2', 4.5],
  ['color-amber-800', 'color-surface', 4.5],
  ['color-primary-600', 'color-surface', 3],
  ['color-veg', 'color-surface', 3],
  ['color-nonveg', 'color-surface', 3],
  ['color-egg', 'color-surface', 3],
  ['color-veg', 'color-surface-2', 3],
  ['color-nonveg', 'color-surface-2', 3],
  ['color-egg', 'color-surface-2', 3],
];

describe.each([
  ['light', light],
  ['dark', dark],
  ['kitchen (forced dark)', kitchen],
])('%s appearance', (_name, table) => {
  it.each(PAIRS)('%s on %s is readable', (fg, bg, min) => {
    expect(ratio(fg, bg, table)).toBeGreaterThanOrEqual(min);
  });
});

describe('dark copies', () => {
  it('declares the same values for the device dark mode and the kitchen display', () => {
    expect(Object.fromEntries(vars(block("[data-theme='dark'] {")))).toEqual(
      Object.fromEntries(vars(block('/* dark appearance'))),
    );
  });
});

/*
 * In dark the status scales mirror, so a class that only makes sense in one appearance breaks
 * the other: dark-shade backgrounds (red-950) turn near-white, light-shade text (red-300) turns
 * dark, and the slate scale does not follow the theme at all. Use the light-appearance meaning
 * (bg-red-50, text-red-700) or a token.
 */
describe('colour classes in the source', () => {
  it('uses none that break when the scales mirror', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(files.length).toBeGreaterThan(50);
    const bad =
      /\btext-(?:red|amber|green|sky|violet)-(?:300|400)\b|\bbg-(?:red|amber|green|sky|violet)-(?:800|900|950)\b|\bbg-slate-(?:50|100|200|300)\b/g;
    const found = files.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(bad)].map((m) => `${f.split('src')[1]}: ${m[0]}`),
    );
    expect(found).toEqual([]);
  });
});
