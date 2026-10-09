// Prints the dark-appearance status scales for app/index.css: each Tailwind step takes the
// value of its mirror (50 <-> 950, 100 <-> 900 ...), so light tints become dark tints and dark
// text becomes light text, and classes like `bg-red-50 text-red-700` keep working in dark.
// Run: node apps/web/scripts/dark-palette.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const theme = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8');
const MIRROR = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500 };
const HUES = ['amber', 'green', 'red', 'sky', 'violet'];

const value = (hue, step) => {
  const m = theme.match(new RegExp(`--color-${hue}-${step}:\s*([^;]+);`));
  if (!m) throw new Error(`no ${hue}-${step}`);
  return m[1].trim();
};

const lines = [];
for (const hue of HUES) {
  for (const [a, b] of Object.entries(MIRROR)) {
    lines.push(`    --color-${hue}-${a}: ${value(hue, b)};`);
    if (Number(a) !== b) lines.push(`    --color-${hue}-${b}: ${value(hue, a)};`);
  }
}
console.log(lines.join('\n'));
